import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';

interface CursorEvent {
  x: number;
  y: number;
  timestampMs: number;
  type: 'move' | 'click';
}

/** Minimum movement speed to consider "active" (px/s) */
const MIN_MOVEMENT_SPEED = 5;
/** Time gap to split cursor segments (ms) */
const SEGMENT_GAP_MS = 2000;

export class CursorProcessorWorker extends BaseWorker {
  readonly taskType = TaskType.CURSOR_PROCESS;

  async processTask(task: TaskData): Promise<TaskResult> {
    const inputAssetId = task.inputAssetIds[0];
    if (!inputAssetId) throw new Error('No input asset ID provided');

    // Download cursor data from GCS
    const dataPath = `projects/${task.projectId}/source_video/${inputAssetId}`;
    const rawData = await this.gcs.download(dataPath);
    const events: CursorEvent[] = JSON.parse(rawData.toString('utf-8'));

    if (events.length === 0) {
      return { outputAssetIds: [], signals: [] };
    }

    // Segment cursor events by time gaps
    const segments = this.segmentEvents(events);
    const signals: TaskResult['signals'] = [];

    for (const segment of segments) {
      if (segment.length < 2) continue;

      const firstEvent = segment[0];
      const lastEvent = segment[segment.length - 1];
      if (!firstEvent || !lastEvent) continue;

      const startMs = firstEvent.timestampMs;
      const endMs = lastEvent.timestampMs;
      const durationMs = endMs - startMs;

      // Compute movement characteristics
      const positions = segment.map(e => ({ x: e.x, y: e.y, timestampMs: e.timestampMs }));
      const totalDistance = this.computeDistance(positions);
      const speed = durationMs > 0 ? (totalDistance / durationMs) * 1000 : 0;
      const movementType = this.classifyMovement(positions, speed);

      if (speed >= MIN_MOVEMENT_SPEED || movementType === 'click') {
        signals.push({
          signalType: SignalType.CURSOR_MOVEMENT,
          timestampMs: startMs,
          durationMs,
          confidence: 0.8,
          payload: {
            positions: positions.slice(0, 50), // Limit for storage
            movementType,
            speed,
          },
        });
      }
    }

    return { outputAssetIds: [], signals };
  }

  private segmentEvents(events: CursorEvent[]): CursorEvent[][] {
    const firstEvent = events[0];
    if (!firstEvent) return [];

    const segments: CursorEvent[][] = [];
    let current: CursorEvent[] = [firstEvent];

    for (let i = 1; i < events.length; i++) {
      const event = events[i];
      const prevEvent = events[i - 1];
      if (!event || !prevEvent) continue;

      const gap = event.timestampMs - prevEvent.timestampMs;
      if (gap > SEGMENT_GAP_MS) {
        segments.push(current);
        current = [];
      }
      current.push(event);
    }
    if (current.length > 0) segments.push(current);
    return segments;
  }

  private computeDistance(positions: Array<{ x: number; y: number }>): number {
    let total = 0;
    for (let i = 1; i < positions.length; i++) {
      const curr = positions[i];
      const prev = positions[i - 1];
      if (!curr || !prev) continue;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
  }

  private classifyMovement(
    positions: Array<{ x: number; y: number; timestampMs: number }>,
    speed: number,
  ): 'linear' | 'erratic' | 'hover' | 'click' {
    if (positions.length <= 2 && speed < MIN_MOVEMENT_SPEED) return 'click';
    if (speed < MIN_MOVEMENT_SPEED) return 'hover';

    // Check linearity: compute R-squared of positions
    const n = positions.length;
    const xs = positions.map(p => p.x);
    const ys = positions.map(p => p.y);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    const ssTotal = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0);

    if (ssTotal === 0) return 'hover';

    const ssXY = xs.reduce((sum, x, i) => {
      const y = ys[i];
      return y !== undefined ? sum + (x - meanX) * (y - meanY) : sum;
    }, 0);
    const ssXX = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);

    if (ssXX === 0) return 'linear';

    const slope = ssXY / ssXX;
    const intercept = meanY - slope * meanX;
    const ssRes = ys.reduce((sum, y, i) => {
      const x = xs[i];
      return x !== undefined ? sum + (y - (slope * x + intercept)) ** 2 : sum;
    }, 0);
    const rSquared = 1 - ssRes / ssTotal;

    return rSquared > 0.85 ? 'linear' : 'erratic';
  }
}
