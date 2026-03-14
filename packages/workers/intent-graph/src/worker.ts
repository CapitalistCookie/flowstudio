import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';
import Anthropic from '@anthropic-ai/sdk';

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

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
    if (!this.config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const anthropic = new Anthropic({ apiKey: this.config.anthropicApiKey });

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

    // Build a summary of all signals for the LLM
    const signalSummary = upstreamSignals.map(s => ({
      type: s.signalType,
      time: `${(s.timestampMs / 1000).toFixed(1)}s`,
      duration: `${(s.durationMs / 1000).toFixed(1)}s`,
      confidence: s.confidence,
      detail: this.summarizePayload(s),
    }));

    const message = await anthropic.messages.create({
      model: this.config.anthropicModel ?? 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are analyzing a screen recording of someone using software. Based on these signals extracted from the video, build an intent graph — a hierarchy of what the user was trying to accomplish.

Signals:
${JSON.stringify(signalSummary, null, 2)}

Build a tree of intents where:
- Root intents are high-level goals (e.g., "Writing a blog post", "Debugging code")
- Child intents are sub-tasks (e.g., "Formatting text", "Searching for function")
- Each intent references the signal timestamps that support it

Respond with JSON array of objects:
{
  "intentId": "string",
  "parentIntentId": "string | null",
  "action": "what the user is doing",
  "reasoning": "why you think this",
  "confidence": 0.0-1.0,
  "startMs": number,
  "endMs": number,
  "relatedSignalIndices": [number]
}`,
      }],
    });

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';

    // Parse intent graph from response
    const signals: TaskResult['signals'] = [];
    try {
      const jsonMatch = extractJsonArray(responseText);
      if (jsonMatch) {
        const intents = JSON.parse(jsonMatch) as Array<{
          intentId: string;
          parentIntentId: string | null;
          action: string;
          reasoning: string;
          confidence: number;
          startMs: number;
          endMs: number;
          relatedSignalIndices: number[];
        }>;

        for (const intent of intents) {
          signals.push({
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
          });
        }
      }
    } catch (err) {
      throw new Error(`Failed to parse intent graph from LLM response: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Save intent graph to GCS
    const graphPath = `projects/${task.projectId}/signals/intent_graph.json`;
    await this.gcs.upload(graphPath, Buffer.from(JSON.stringify(signals, null, 2)), 'application/json');

    return { outputAssetIds: [`intent-graph-${task.projectId}`], signals };
  }

  private summarizePayload(signal: UpstreamSignal): string {
    const p = signal.payload;
    switch (signal.signalType) {
      case SignalType.SPEECH_SEGMENT:
        return `Speech: "${(p.text as string)?.slice(0, 100)}"`;
      case SignalType.SCENE_CHANGE:
        return `Scene: ${p.description as string}`;
      case SignalType.UI_TRANSITION:
        return `UI: ${p.transitionType} (${p.fromState} → ${p.toState})`;
      case SignalType.CURSOR_MOVEMENT:
        return `Cursor: ${p.movementType}, ${(p.speed as number)?.toFixed(0)}px/s`;
      case SignalType.TYPING_EVENT:
        return `Typing: "${(p.detectedText as string)?.slice(0, 50)}"`;
      case SignalType.INTERACTION_CLUSTER:
        return `Cluster: ${p.intent} (${p.clusterLabel})`;
      default:
        return JSON.stringify(p).slice(0, 100);
    }
  }
}
