import { TaskType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';
import ffmpeg from 'fluent-ffmpeg';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

ffmpeg.setFfmpegPath(ffmpegPath);

interface TimelineClip {
  clipId: string;
  startMs: number;
  endMs: number;
  sourceAssetId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  effects: Array<{ type: string; params: Record<string, unknown> }>;
}

interface Timeline {
  videoTrack: TimelineClip[];
  audioTrack: TimelineClip[];
}

export class RenderWorker extends BaseWorker {
  readonly taskType = TaskType.RENDER;

  async processTask(task: TaskData): Promise<TaskResult> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'render-'));

    try {
      // Download timeline
      const timelinePath = `projects/${task.projectId}/timeline/timeline.json`;
      const timelineData = await this.gcs.download(timelinePath);
      const timeline: Timeline = JSON.parse(timelineData.toString('utf-8'));

      // Download source video
      const sourceAssetId = task.inputAssetIds[0] ?? 'source';
      const sourcePath = `projects/${task.projectId}/source_video/${sourceAssetId}`;
      const videoData = await this.gcs.download(sourcePath);
      const inputPath = join(tmpDir, 'source.mp4');
      const writeStream = createWriteStream(inputPath);
      writeStream.write(videoData);
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Build FFmpeg filter complex from timeline
      const { filterComplex, outputMaps } = this.buildFilterComplex(timeline);

      // Render output
      const outputPath = join(tmpDir, 'output.mp4');

      await new Promise<void>((resolve, reject) => {
        let cmd = ffmpeg(inputPath);

        if (filterComplex) {
          cmd = cmd.complexFilter(filterComplex);
          for (const map of outputMaps) {
            cmd = cmd.outputOptions(['-map', map]);
          }
        }

        cmd
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions(['-preset', 'fast', '-crf', '23', '-movflags', '+faststart'])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      // Upload rendered video to GCS
      const renderedData = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = createReadStream(outputPath);
        stream.on('data', (chunk: Buffer | string) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });

      const outputGcsPath = `projects/${task.projectId}/rendered_video/output.mp4`;
      await this.gcs.upload(outputGcsPath, renderedData, 'video/mp4');

      return {
        outputAssetIds: [`rendered-${task.projectId}`],
        signals: [],
      };
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  /** Build FFmpeg filter_complex string from timeline clips */
  private buildFilterComplex(timeline: Timeline): { filterComplex: string; outputMaps: string[] } {
    if (timeline.videoTrack.length === 0) {
      return { filterComplex: '', outputMaps: [] };
    }

    const filters: string[] = [];
    const concatInputs: string[] = [];

    // Create trim + setpts filters for each video clip
    for (let i = 0; i < timeline.videoTrack.length; i++) {
      const clip = timeline.videoTrack[i]!;
      const startSec = clip.sourceStartMs / 1000;
      const endSec = clip.sourceEndMs / 1000;

      let speedRate = 1.0;
      for (const effect of clip.effects) {
        if (effect.type === 'speed') {
          speedRate = (effect.params.rate as number) ?? 1.0;
        }
      }

      filters.push(
        `[0:v]trim=start=${startSec}:end=${endSec},setpts=(PTS-STARTPTS)/${speedRate}[v${i}]`,
      );
      filters.push(
        `[0:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS,atempo=${speedRate}[a${i}]`,
      );
      concatInputs.push(`[v${i}][a${i}]`);
    }

    // Concatenate all clips
    const n = timeline.videoTrack.length;
    filters.push(`${concatInputs.join('')}concat=n=${n}:v=1:a=1[outv][outa]`);

    return {
      filterComplex: filters.join(';'),
      outputMaps: ['[outv]', '[outa]'],
    };
  }
}
