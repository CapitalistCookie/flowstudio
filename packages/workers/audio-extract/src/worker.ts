import { TaskType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';
import ffmpeg from 'fluent-ffmpeg';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

ffmpeg.setFfmpegPath(ffmpegPath);

export class AudioExtractWorker extends BaseWorker {
  readonly taskType = TaskType.AUDIO_EXTRACT;

  async processTask(task: TaskData): Promise<TaskResult> {
    const inputAssetId = task.inputAssetIds[0];
    if (!inputAssetId) throw new Error('No input asset ID provided');

    // Create temp directory
    const tmpDir = await mkdtemp(join(tmpdir(), 'audio-extract-'));
    const inputPath = join(tmpDir, 'input.mp4');
    const outputPath = join(tmpDir, 'audio.wav');

    try {
      // Download source video from GCS
      const videoPath = `projects/${task.projectId}/source_video/${inputAssetId}`;
      const videoData = await this.gcs.download(videoPath);
      const writeStream = createWriteStream(inputPath);
      writeStream.write(videoData);
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Extract audio using FFmpeg
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .noVideo()
          .audioCodec('pcm_s16le')
          .audioFrequency(16000)
          .audioChannels(1)
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      // Upload extracted audio to GCS
      const gcsOutputPath = `projects/${task.projectId}/audio_track/audio.wav`;
      const audioData = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = createReadStream(outputPath);
        stream.on('data', (chunk: Buffer | string) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });

      await this.gcs.upload(gcsOutputPath, audioData, 'audio/wav');

      const outputAssetId = `audio-${task.projectId}`;
      return {
        outputAssetIds: [outputAssetId],
        signals: [],
      };
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }
}
