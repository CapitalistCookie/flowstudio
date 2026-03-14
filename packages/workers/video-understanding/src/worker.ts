import { TaskType, SignalType, extractJsonArray } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';
import { GoogleGenerativeAI } from '@google/generative-ai';

/** How many frames to analyze per batch */
const FRAMES_PER_BATCH = 4;

/** Default sample interval assumed for timestamp calculation */
const DEFAULT_SAMPLE_INTERVAL_MS = 2000;

type VideoContextMode = 'frames' | 'video';

interface VideoChange {
  description: string;
  changeType: string;
  significance: number;
  timestampMs?: number;
}

export class VideoUnderstandingWorker extends BaseWorker {
  readonly taskType = TaskType.VIDEO_UNDERSTANDING;

  async processTask(task: TaskData): Promise<TaskResult> {
    if (!this.config.googleAiApiKey) {
      throw new Error('GOOGLE_AI_API_KEY not configured');
    }

    const mode = (task.config.videoContextMode as VideoContextMode) ?? 'frames';
    const sampleIntervalMs = ((task.config.sampleIntervalSecs as number) ?? 2) * 1000;

    const genAI = new GoogleGenerativeAI(this.config.googleAiApiKey);
    const modelName = this.config.googleAiModel ?? 'gemini-2.0-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    const signals: TaskResult['signals'] =
      mode === 'video'
        ? await this.processVideoMode(task, genAI, modelName, sampleIntervalMs)
        : await this.processFrameMode(task, model, sampleIntervalMs);

    if (signals.length > 0) {
      const gcsSignalPath = `projects/${task.projectId}/signals/scene_descriptions.json`;
      await this.gcs.upload(
        gcsSignalPath,
        Buffer.from(JSON.stringify(signals, null, 2)),
        'application/json',
      );
    }

    return { outputAssetIds: [], signals };
  }

  /**
   * Video mode: Upload entire video to Gemini File API for temporal understanding.
   * Provides better context than individual frames — captures motion, transitions, pacing.
   */
  private async processVideoMode(
    task: TaskData,
    genAI: GoogleGenerativeAI,
    modelName: string,
    _sampleIntervalMs: number,
  ): Promise<TaskResult['signals']> {
    const sourceAssetId = task.inputAssetIds[0];
    if (!sourceAssetId) throw new Error('No source video asset provided for video mode');

    const videoPath = `projects/${task.projectId}/source_video/${sourceAssetId}`;
    const videoData = await this.gcs.download(videoPath);

    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent([
      {
        inlineData: {
          data: videoData.toString('base64'),
          mimeType: 'video/mp4',
        },
      },
      {
        text: `Analyze this screen recording video. Identify every significant moment including:
1. UI navigation events (page changes, modal opens, tab switches)
2. Content creation (typing, drawing, editing)
3. Search/browse actions
4. Errors or corrections
5. Achievements or completions

For each event, provide the approximate timestamp in milliseconds.

Respond as a JSON array:
[{
  "description": "what happened",
  "changeType": "navigation|modal|scroll|content_update|error|completion",
  "significance": 0.0-1.0,
  "timestampMs": number
}]`,
      },
    ]);

    const text = result.response.text();
    return this.parseChanges(text);
  }

  /**
   * Frame mode: Analyze sampled frames in batches (original approach).
   * Works without video upload support but lacks temporal context.
   */
  private async processFrameMode(
    task: TaskData,
    model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
    sampleIntervalMs: number,
  ): Promise<TaskResult['signals']> {
    const frameAssetIds = task.inputAssetIds;
    if (frameAssetIds.length === 0) throw new Error('No frame assets provided');

    const signals: TaskResult['signals'] = [];

    for (let i = 0; i < frameAssetIds.length; i += FRAMES_PER_BATCH) {
      const batchIds = frameAssetIds.slice(i, i + FRAMES_PER_BATCH);
      const frameBuffers: Buffer[] = [];

      for (const assetId of batchIds) {
        const gcsPath = `projects/${task.projectId}/frame_sample/${assetId}.jpg`;
        const exists = await this.gcs.exists(gcsPath);
        if (exists) {
          frameBuffers.push(await this.gcs.download(gcsPath));
        }
      }

      if (frameBuffers.length === 0) continue;

      const imageParts = frameBuffers.map(buf => ({
        inlineData: {
          data: buf.toString('base64'),
          mimeType: 'image/jpeg',
        },
      }));

      const result = await model.generateContent([
        ...imageParts,
        {
          text: `Analyze these ${frameBuffers.length} consecutive video frames. For each significant visual change or scene transition between frames, describe:
1. What changed (UI element, screen content, navigation)
2. The type of change (navigation, modal, scroll, tab switch, content update)
3. The significance (minor tweak vs major scene change)

Respond in JSON format as an array of objects with fields: description, changeType, significance (0-1 float).
If no significant changes, return an empty array.`,
        },
      ]);

      const text = result.response.text();
      const batchSignals = this.parseChanges(text, i * sampleIntervalMs, i);
      signals.push(...batchSignals);
    }

    return signals;
  }

  private parseChanges(text: string, baseTimestampMs = 0, frameIndex = 0): TaskResult['signals'] {
    const signals: TaskResult['signals'] = [];
    try {
      const jsonMatch = extractJsonArray(text);
      if (jsonMatch) {
        const changes = JSON.parse(jsonMatch) as VideoChange[];
        for (const change of changes) {
          signals.push({
            signalType: SignalType.SCENE_CHANGE,
            timestampMs: change.timestampMs ?? baseTimestampMs,
            durationMs: 0,
            confidence: change.significance,
            payload: {
              frameIndex,
              changeScore: change.significance,
              description: change.description,
              changeType: change.changeType,
              beforeFrameGcs: '',
              afterFrameGcs: '',
            },
          });
        }
      }
    } catch {
      this.logger.warn('Failed to parse Gemini response as JSON', { text: text.slice(0, 200) });
    }
    return signals;
  }
}
