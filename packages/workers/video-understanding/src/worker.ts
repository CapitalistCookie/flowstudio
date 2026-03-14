import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';
import { GoogleGenerativeAI } from '@google/generative-ai';

/** How many frames to analyze per batch */
const FRAMES_PER_BATCH = 4;

export class VideoUnderstandingWorker extends BaseWorker {
  readonly taskType = TaskType.VIDEO_UNDERSTANDING;

  async processTask(task: TaskData): Promise<TaskResult> {
    if (!this.config.googleAiApiKey) {
      throw new Error('GOOGLE_AI_API_KEY not configured');
    }

    const genAI = new GoogleGenerativeAI(this.config.googleAiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Download frame samples
    const frameAssetIds = task.inputAssetIds;
    if (frameAssetIds.length === 0) throw new Error('No frame assets provided');

    const signals: TaskResult['signals'] = [];

    // Process frames in batches
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

      // Build multimodal prompt with frames
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

      // Parse JSON from response
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const changes = JSON.parse(jsonMatch[0]) as Array<{
            description: string;
            changeType: string;
            significance: number;
          }>;

          for (const change of changes) {
            signals.push({
              signalType: SignalType.SCENE_CHANGE,
              timestampMs: i * 2000, // Approximate based on 2s interval
              durationMs: 0,
              confidence: change.significance,
              payload: {
                frameIndex: i,
                changeScore: change.significance,
                description: change.description,
                beforeFrameGcs: '',
                afterFrameGcs: '',
              },
            });
          }
        }
      } catch {
        this.logger.warn('Failed to parse Gemini response as JSON', { text: text.slice(0, 200) });
      }
    }

    return { outputAssetIds: [], signals };
  }
}
