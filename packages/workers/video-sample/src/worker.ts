import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';
import ffmpeg from 'fluent-ffmpeg';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import { mkdtemp, rm, readdir, readFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

ffmpeg.setFfmpegPath(ffmpegPath);

/** Default sample interval in seconds */
const SAMPLE_INTERVAL_SECS = 2;

export class VideoSampleWorker extends BaseWorker {
  readonly taskType = TaskType.VIDEO_SAMPLE;

  async processTask(task: TaskData): Promise<TaskResult> {
    const inputAssetId = task.inputAssetIds[0];
    if (!inputAssetId) throw new Error('No input asset ID provided');

    const sampleInterval = (task.config.sampleIntervalSecs as number) ?? SAMPLE_INTERVAL_SECS;

    const tmpDir = await mkdtemp(join(tmpdir(), 'video-sample-'));
    const inputPath = join(tmpDir, 'input.mp4');
    const framesDir = join(tmpDir, 'frames');
    await mkdir(framesDir, { recursive: true });

    try {
      // Download source video
      const videoPath = `projects/${task.projectId}/source_video/${inputAssetId}`;
      const videoData = await this.gcs.download(videoPath);
      const writeStream = createWriteStream(inputPath);
      writeStream.write(videoData);
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Extract frames at interval
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([`-vf`, `fps=1/${sampleInterval}`, '-q:v', '2'])
          .output(join(framesDir, 'frame-%04d.jpg'))
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      // Read and process frames
      const frameFiles = (await readdir(framesDir)).filter(f => f.endsWith('.jpg')).sort();
      const outputAssetIds: string[] = [];
      const signals: TaskResult['signals'] = [];

      for (let i = 0; i < frameFiles.length; i++) {
        const frameFile = frameFiles[i];
        if (!frameFile) continue;
        const framePath = join(framesDir, frameFile);
        const frameData = await readFile(framePath);

        // Resize to standard size for analysis
        const resized = await sharp(frameData)
          .resize(1280, 720, { fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer();

        // Upload frame to GCS
        const gcsPath = `projects/${task.projectId}/frame_sample/frame-${String(i).padStart(4, '0')}.jpg`;
        await this.gcs.upload(gcsPath, resized, 'image/jpeg');

        const assetId = `frame-${task.projectId}-${i}`;
        outputAssetIds.push(assetId);

        // Detect scene changes by comparing consecutive frames
        if (i > 0) {
          const prevFrameFile = frameFiles[i - 1];
          if (prevFrameFile) {
            const prevFramePath = join(framesDir, prevFrameFile);
            const prevData = await readFile(prevFramePath);
            const diffScore = await this.computeFrameDiff(prevData, frameData);

            if (diffScore > 0.3) {
              signals.push({
                signalType: SignalType.SCENE_CHANGE,
                timestampMs: i * sampleInterval * 1000,
                durationMs: 0,
                confidence: Math.min(diffScore, 1.0),
                payload: {
                  frameIndex: i,
                  changeScore: diffScore,
                  description: `Scene change detected at frame ${i}`,
                  beforeFrameGcs: `projects/${task.projectId}/frame_sample/frame-${String(i - 1).padStart(4, '0')}.jpg`,
                  afterFrameGcs: gcsPath,
                },
              });
            }
          }
        }
      }

      return { outputAssetIds, signals };
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  /** Compute normalized difference between two frames */
  private async computeFrameDiff(frame1: Buffer, frame2: Buffer): Promise<number> {
    const size = 64; // Downscale for fast comparison
    const [raw1, raw2] = await Promise.all([
      sharp(frame1).resize(size, size).greyscale().raw().toBuffer(),
      sharp(frame2).resize(size, size).greyscale().raw().toBuffer(),
    ]);

    let totalDiff = 0;
    for (let i = 0; i < raw1.length; i++) {
      totalDiff += Math.abs((raw1[i] ?? 0) - (raw2[i] ?? 0));
    }
    return totalDiff / (raw1.length * 255);
  }
}
