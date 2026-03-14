import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';

interface InputSignal {
  signalType: string;
  timestampMs: number;
  durationMs: number;
  payload: Record<string, unknown>;
}

/** Time window to cluster interactions (ms) */
const CLUSTER_WINDOW_MS = 5000;

export class InteractionPatternWorker extends BaseWorker {
  readonly taskType = TaskType.INTERACTION_PATTERN;

  async processTask(task: TaskData): Promise<TaskResult> {
    // Download upstream signal data from GCS (cursor + typing separately)
    let inputSignals: InputSignal[] = [];

    const signalFiles = [
      `projects/${task.projectId}/signals/cursor_movements.json`,
      `projects/${task.projectId}/signals/typing_events.json`,
    ];

    for (const signalPath of signalFiles) {
      try {
        const data = await this.gcs.download(signalPath);
        const parsed = JSON.parse(data.toString('utf-8')) as InputSignal[];
        inputSignals.push(...parsed);
      } catch {
        // File may not exist if no cursor/typing data was captured
      }
    }

    if (inputSignals.length === 0) {
      this.logger.warn('No cursor/typing signals found, producing empty result');
      return { outputAssetIds: [], signals: [] };
    }

    // Sort by timestamp
    inputSignals.sort((a, b) => a.timestampMs - b.timestampMs);

    // Cluster nearby interactions
    const clusters = this.clusterInteractions(inputSignals);
    const signals: TaskResult['signals'] = [];

    for (const cluster of clusters) {
      const interactions = cluster.map(sig => ({
        type: this.mapSignalToInteractionType(sig.signalType),
        timestampMs: sig.timestampMs,
        position: this.extractPosition(sig.payload),
      }));

      const intent = this.inferIntent(cluster);

      signals.push({
        signalType: SignalType.INTERACTION_CLUSTER,
        timestampMs: cluster[0]!.timestampMs,
        durationMs: (cluster[cluster.length - 1]!.timestampMs + cluster[cluster.length - 1]!.durationMs) - cluster[0]!.timestampMs,
        confidence: 0.75,
        payload: {
          interactions,
          intent,
          clusterLabel: this.labelCluster(intent, interactions.length),
        },
      });
    }

    // Write signals to GCS for downstream intent-graph worker
    if (signals.length > 0) {
      const gcsSignalPath = `projects/${task.projectId}/signals/interaction_clusters.json`;
      await this.gcs.upload(
        gcsSignalPath,
        Buffer.from(JSON.stringify(signals, null, 2)),
        'application/json',
      );
    }

    return { outputAssetIds: [], signals };
  }

  private clusterInteractions(signals: InputSignal[]): InputSignal[][] {
    const clusters: InputSignal[][] = [];
    let current: InputSignal[] = [signals[0]!];

    for (let i = 1; i < signals.length; i++) {
      const gap = signals[i]!.timestampMs - (signals[i - 1]!.timestampMs + signals[i - 1]!.durationMs);
      if (gap > CLUSTER_WINDOW_MS) {
        clusters.push(current);
        current = [];
      }
      current.push(signals[i]!);
    }
    if (current.length > 0) clusters.push(current);
    return clusters;
  }

  private mapSignalToInteractionType(signalType: string): 'click' | 'type' | 'scroll' | 'hover' {
    switch (signalType) {
      case SignalType.TYPING_EVENT: return 'type';
      case SignalType.CURSOR_MOVEMENT: {
        return 'click'; // Simplified -- would check payload.movementType in production
      }
      default: return 'hover';
    }
  }

  private extractPosition(payload: Record<string, unknown>): { x: number; y: number } {
    if (payload.positions && Array.isArray(payload.positions) && payload.positions.length > 0) {
      const first = payload.positions[0] as { x: number; y: number };
      return { x: first.x, y: first.y };
    }
    if (payload.inputRegion && typeof payload.inputRegion === 'object') {
      const region = payload.inputRegion as { x: number; y: number };
      return { x: region.x, y: region.y };
    }
    return { x: 0, y: 0 };
  }

  private inferIntent(cluster: InputSignal[]): string {
    const hasTyping = cluster.some(s => s.signalType === SignalType.TYPING_EVENT);
    const hasCursor = cluster.some(s => s.signalType === SignalType.CURSOR_MOVEMENT);

    if (hasTyping && hasCursor) return 'form_interaction';
    if (hasTyping) return 'text_input';
    if (hasCursor) return 'navigation';
    return 'unknown';
  }

  private labelCluster(intent: string, interactionCount: number): string {
    return `${intent} (${interactionCount} actions)`;
  }
}
