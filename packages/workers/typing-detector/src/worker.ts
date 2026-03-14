import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';

interface KeyEvent {
  key: string;
  timestampMs: number;
  type: 'keydown' | 'keyup';
}

interface TypingBurst {
  startMs: number;
  endMs: number;
  keys: string[];
  cps: number;
}

/** Minimum burst length to report */
const MIN_BURST_KEYS = 3;
/** Max gap between keystrokes in a burst (ms) */
const BURST_GAP_MS = 1500;
/** CPS threshold for paste detection */
const PASTE_CPS_THRESHOLD = 15;

export class TypingDetectorWorker extends BaseWorker {
  readonly taskType = TaskType.TYPING_DETECT;

  async processTask(task: TaskData): Promise<TaskResult> {
    const inputAssetId = task.inputAssetIds[0];
    if (!inputAssetId) throw new Error('No input asset ID provided');

    // Download keyboard event data
    const dataPath = `projects/${task.projectId}/source_video/${inputAssetId}`;
    const rawData = await this.gcs.download(dataPath);
    const events: KeyEvent[] = JSON.parse(rawData.toString('utf-8'));

    // Filter to keydown events only
    const keydowns = events.filter(e => e.type === 'keydown');
    if (keydowns.length < MIN_BURST_KEYS) {
      return { outputAssetIds: [], signals: [] };
    }

    // Detect typing bursts
    const bursts = this.detectBursts(keydowns);
    const signals: TaskResult['signals'] = [];

    for (const burst of bursts) {
      const isPaste = burst.cps > PASTE_CPS_THRESHOLD;
      const detectedText = burst.keys
        .filter(k => k.length === 1)
        .join('');

      signals.push({
        signalType: SignalType.TYPING_EVENT,
        timestampMs: burst.startMs,
        durationMs: burst.endMs - burst.startMs,
        confidence: 0.85,
        payload: {
          detectedText,
          inputRegion: { x: 0, y: 0, width: 0, height: 0 }, // Populated by UI analysis
          charactersPerSecond: burst.cps,
          isPaste,
        },
      });
    }

    return { outputAssetIds: [], signals };
  }

  private detectBursts(keydowns: KeyEvent[]): TypingBurst[] {
    const firstEvent = keydowns[0];
    if (!firstEvent) return [];

    const bursts: TypingBurst[] = [];
    let currentBurst: KeyEvent[] = [firstEvent];

    for (let i = 1; i < keydowns.length; i++) {
      const event = keydowns[i];
      const prevEvent = keydowns[i - 1];
      if (!event || !prevEvent) continue;

      const gap = event.timestampMs - prevEvent.timestampMs;
      if (gap > BURST_GAP_MS) {
        if (currentBurst.length >= MIN_BURST_KEYS) {
          bursts.push(this.toBurst(currentBurst));
        }
        currentBurst = [];
      }
      currentBurst.push(event);
    }
    if (currentBurst.length >= MIN_BURST_KEYS) {
      bursts.push(this.toBurst(currentBurst));
    }

    return bursts;
  }

  private toBurst(events: KeyEvent[]): TypingBurst {
    const first = events[0];
    const last = events[events.length - 1];
    if (!first || !last) {
      return { startMs: 0, endMs: 0, keys: [], cps: 0 };
    }
    const startMs = first.timestampMs;
    const endMs = last.timestampMs;
    const durationSecs = (endMs - startMs) / 1000;
    return {
      startMs,
      endMs,
      keys: events.map(e => e.key),
      cps: durationSecs > 0 ? events.length / durationSecs : events.length,
    };
  }
}
