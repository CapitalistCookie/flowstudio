import { TaskType, SignalType, sanitizeText, buildSecurePrompt, validateOutput, PROMPT_REGISTRY, IntentGraphOutputSchema } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult, callVertexLlm } from '@flowstudio/worker-shared';

interface UpstreamSignal {
  signalType: string;
  timestampMs: number;
  durationMs: number;
  confidence: number;
  payload: Record<string, unknown>;
}

export class IntentGraphWorker extends BaseWorker {
  readonly taskType = TaskType.INTENT_GRAPH;

  async processTask(task: TaskData): Promise<TaskResult> {
    // Download all upstream signals from individual signal files
    const signalFiles = [
      `projects/${task.projectId}/signals/speech_segments.json`,
      `projects/${task.projectId}/signals/scene_descriptions.json`,
      `projects/${task.projectId}/signals/ui_transitions.json`,
      `projects/${task.projectId}/signals/interaction_clusters.json`,
    ];

    const upstreamSignals: UpstreamSignal[] = [];
    for (const signalPath of signalFiles) {
      try {
        const rawData = await this.gcs.download(signalPath);
        const parsed = JSON.parse(rawData.toString('utf-8')) as UpstreamSignal[];
        upstreamSignals.push(...parsed);
      } catch {
        this.logger.warn(`Signal file not found: ${signalPath}`);
      }
    }

    if (upstreamSignals.length === 0) {
      throw new Error('No upstream signals found — cannot build intent graph');
    }

    // Sort by timestamp
    upstreamSignals.sort((a, b) => a.timestampMs - b.timestampMs);

    // Build a sanitized summary of all signals for the LLM
    const signalSummary = upstreamSignals.map(s => ({
      type: s.signalType,
      time: `${(s.timestampMs / 1000).toFixed(1)}s`,
      duration: `${(s.durationMs / 1000).toFixed(1)}s`,
      confidence: s.confidence,
      detail: this.summarizePayload(s),
    }));

    // Read prompt overrides from task config, falling back to registry defaults
    const registry = PROMPT_REGISTRY['intent-graph'];
    if (!registry) throw new Error('Missing prompt registry entry for intent-graph');
    const overrides = task.config.promptOverrides as Record<string, unknown> | undefined;
    const systemPrompt = (overrides?.systemPrompt as string) ?? registry.systemPrompt;
    const maxTokens = (overrides?.maxTokens as number) ?? registry.defaultMaxTokens;

    // Build secure prompt with system/user separation and XML-fenced data
    const prompt = buildSecurePrompt({
      systemPrompt,
      dataBlocks: [{
        label: 'upstream_signals',
        content: JSON.stringify(signalSummary, null, 2),
      }],
    });

    const responseText = await callVertexLlm(this.config, { maxTokens, prompt });

    // Validate output against Zod schema
    const validation = validateOutput(responseText, IntentGraphOutputSchema);
    if (!validation.parsed) {
      throw new Error(`Failed to parse intent graph from LLM response: ${validation.errors?.join('; ')}`);
    }

    const signals: TaskResult['signals'] = validation.parsed.map(intent => ({
      signalType: SignalType.INTENT_NODE,
      timestampMs: intent.startMs,
      durationMs: intent.endMs - intent.startMs,
      confidence: intent.confidence,
      payload: {
        intentId: intent.intentId,
        parentIntentId: intent.parentIntentId,
        action: intent.action,
        reasoning: intent.reasoning,
        confidence: intent.confidence,
        relatedSignalIds: intent.relatedSignalIndices.map(i => String(i)),
      },
    }));

    // Save intent graph to GCS
    const graphPath = `projects/${task.projectId}/signals/intent_graph.json`;
    await this.gcs.upload(graphPath, Buffer.from(JSON.stringify(signals, null, 2)), 'application/json');

    return { outputAssetIds: [`intent-graph-${task.projectId}`], signals };
  }

  private summarizePayload(signal: UpstreamSignal): string {
    const p = signal.payload;
    switch (signal.signalType) {
      case SignalType.SPEECH_SEGMENT:
        return `Speech: "${sanitizeText((p.text as string) ?? '', 100)}"`;
      case SignalType.SCENE_CHANGE:
        return `Scene: ${sanitizeText((p.description as string) ?? '', 200)}`;
      case SignalType.UI_TRANSITION:
        return `UI: ${sanitizeText(String(p.transitionType ?? ''), 50)} (${sanitizeText(String(p.fromState ?? ''), 50)} → ${sanitizeText(String(p.toState ?? ''), 50)})`;
      case SignalType.CURSOR_MOVEMENT:
        return `Cursor: ${p.movementType}, ${(p.speed as number)?.toFixed(0)}px/s`;
      case SignalType.TYPING_EVENT:
        return `Typing: "${sanitizeText((p.detectedText as string) ?? '', 50)}"`;
      case SignalType.INTERACTION_CLUSTER:
        return `Cluster: ${sanitizeText(String(p.intent ?? ''), 100)} (${sanitizeText(String(p.clusterLabel ?? ''), 50)})`;
      default:
        return sanitizeText(JSON.stringify(p), 100);
    }
  }
}
