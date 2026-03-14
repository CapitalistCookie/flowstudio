import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';
import sharp from 'sharp';

/** Minimum diff score to report as UI transition */
const UI_CHANGE_THRESHOLD = 0.05;
/** Size to downscale frames for comparison */
const COMPARE_SIZE = 128;

interface RegionDiff {
  x: number;
  y: number;
  width: number;
  height: number;
  diffScore: number;
}

export class UIChangeDetectorWorker extends BaseWorker {
  readonly taskType = TaskType.UI_CHANGE_DETECT;

  async processTask(task: TaskData): Promise<TaskResult> {
    const frameAssetIds = task.inputAssetIds;
    if (frameAssetIds.length < 2) {
      return { outputAssetIds: [], signals: [] };
    }

    const signals: TaskResult['signals'] = [];
    let prevBuffer: Buffer | null = null;
    let prevRegions: RegionDiff[] = [];

    for (let i = 0; i < frameAssetIds.length; i++) {
      const gcsPath = `projects/${task.projectId}/frame_sample/frame-${String(i).padStart(4, '0')}.jpg`;
      let currentBuffer: Buffer;
      try {
        currentBuffer = await this.gcs.download(gcsPath);
      } catch {
        continue;
      }

      if (prevBuffer) {
        const regions = await this.detectChangedRegions(prevBuffer, currentBuffer);
        const totalDiff = regions.reduce((sum, r) => sum + r.diffScore, 0) / Math.max(regions.length, 1);

        if (totalDiff > UI_CHANGE_THRESHOLD) {
          const dominantRegion = regions.reduce((best, r) =>
            r.diffScore > best.diffScore ? r : best, regions[0]!);

          const transitionType = this.classifyTransition(regions, prevRegions);

          signals.push({
            signalType: SignalType.UI_TRANSITION,
            timestampMs: i * 2000,
            durationMs: 2000,
            confidence: Math.min(totalDiff * 2, 1.0),
            payload: {
              fromState: `frame-${i - 1}`,
              toState: `frame-${i}`,
              transitionType,
              affectedRegion: dominantRegion
                ? { x: dominantRegion.x, y: dominantRegion.y, width: dominantRegion.width, height: dominantRegion.height }
                : { x: 0, y: 0, width: COMPARE_SIZE, height: COMPARE_SIZE },
              diffScore: totalDiff,
            },
          });
        }
        prevRegions = regions;
      }
      prevBuffer = currentBuffer;
    }

    return { outputAssetIds: [], signals };
  }

  /** Divide frames into grid and compute per-region diffs */
  private async detectChangedRegions(frame1: Buffer, frame2: Buffer): Promise<RegionDiff[]> {
    const gridSize = 4; // 4x4 grid = 16 regions
    const cellSize = COMPARE_SIZE / gridSize;

    const [raw1, raw2] = await Promise.all([
      sharp(frame1).resize(COMPARE_SIZE, COMPARE_SIZE).greyscale().raw().toBuffer(),
      sharp(frame2).resize(COMPARE_SIZE, COMPARE_SIZE).greyscale().raw().toBuffer(),
    ]);

    const regions: RegionDiff[] = [];

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let regionDiff = 0;
        let pixelCount = 0;

        for (let y = gy * cellSize; y < (gy + 1) * cellSize; y++) {
          for (let x = gx * cellSize; x < (gx + 1) * cellSize; x++) {
            const idx = y * COMPARE_SIZE + x;
            regionDiff += Math.abs((raw1[idx] ?? 0) - (raw2[idx] ?? 0));
            pixelCount++;
          }
        }

        const normalizedDiff = regionDiff / (pixelCount * 255);
        regions.push({
          x: gx * cellSize,
          y: gy * cellSize,
          width: cellSize,
          height: cellSize,
          diffScore: normalizedDiff,
        });
      }
    }

    return regions;
  }

  /** Classify the type of UI transition based on change pattern */
  private classifyTransition(
    regions: RegionDiff[],
    _prevRegions: RegionDiff[],
  ): 'navigation' | 'modal' | 'scroll' | 'tab' | 'other' {
    const changedRegions = regions.filter(r => r.diffScore > UI_CHANGE_THRESHOLD);
    const totalRegions = regions.length;
    const changedRatio = changedRegions.length / totalRegions;

    // Full page change = navigation
    if (changedRatio > 0.7) return 'navigation';

    // Center cluster = modal
    const centerChanged = changedRegions.filter(r => {
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      return cx > COMPARE_SIZE * 0.25 && cx < COMPARE_SIZE * 0.75
          && cy > COMPARE_SIZE * 0.25 && cy < COMPARE_SIZE * 0.75;
    });
    if (centerChanged.length > changedRegions.length * 0.6) return 'modal';

    // Top row only = tab
    const topChanged = changedRegions.filter(r => r.y < COMPARE_SIZE / 4);
    if (topChanged.length > changedRegions.length * 0.6) return 'tab';

    // Vertical strip = scroll
    const colCounts = new Map<number, number>();
    for (const r of changedRegions) {
      colCounts.set(r.x, (colCounts.get(r.x) ?? 0) + 1);
    }
    for (const count of colCounts.values()) {
      if (count >= 3) return 'scroll';
    }

    return 'other';
  }
}
