import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';
import { createClient, type DeepgramResponse, type SyncPrerecordedResponse } from '@deepgram/sdk';

export class SpeechTranscriptionWorker extends BaseWorker {
  readonly taskType = TaskType.SPEECH_TRANSCRIPTION;

  async processTask(task: TaskData): Promise<TaskResult> {
    const inputAssetId = task.inputAssetIds[0];
    if (!inputAssetId) throw new Error('No input asset ID provided');

    if (!this.config.deepgramApiKey) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }

    const deepgram = createClient(this.config.deepgramApiKey);

    // Download audio from GCS
    const audioPath = `projects/${task.projectId}/audio_track/audio.wav`;
    const audioData = await this.gcs.download(audioPath);

    // Transcribe with Deepgram
    const { result } = await deepgram.listen.prerecorded.transcribeFile(audioData, {
      model: 'nova-2',
      smart_format: true,
      utterances: true,
      diarize: true,
      punctuate: true,
    }) as DeepgramResponse<SyncPrerecordedResponse>;

    if (!result) throw new Error('Deepgram returned no result');

    // Upload transcript to GCS
    const transcriptPath = `projects/${task.projectId}/transcript/transcript.json`;
    await this.gcs.upload(
      transcriptPath,
      Buffer.from(JSON.stringify(result, null, 2)),
      'application/json',
    );

    // Convert utterances to speech segment signals
    const signals: TaskResult['signals'] = [];
    const utterances = result.results?.utterances ?? [];

    for (const utterance of utterances) {
      const words = (utterance.words ?? []).map((w: { word: string; start: number; end: number; confidence: number }) => ({
        word: w.word,
        startMs: Math.round(w.start * 1000),
        endMs: Math.round(w.end * 1000),
        confidence: w.confidence,
      }));

      signals.push({
        signalType: SignalType.SPEECH_SEGMENT,
        timestampMs: Math.round(utterance.start * 1000),
        durationMs: Math.round((utterance.end - utterance.start) * 1000),
        confidence: utterance.confidence,
        payload: {
          text: utterance.transcript,
          words,
          speakerId: String(utterance.speaker ?? 0),
          language: result.results?.channels?.[0]?.detected_language ?? 'en',
        },
      });
    }

    return {
      outputAssetIds: [`transcript-${task.projectId}`],
      signals,
    };
  }
}
