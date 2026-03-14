import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

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

export class NarrativePlannerWorker extends BaseWorker {
  readonly taskType = TaskType.NARRATIVE_PLAN;

  async processTask(task: TaskData): Promise<TaskResult> {
    const anthropic = new AnthropicVertex({
      region: this.config.vertexRegion ?? 'us-central1',
      projectId: this.config.vertexProjectId ?? this.config.gcsProjectId,
    });

    // Download intent graph
    const graphPath = `projects/${task.projectId}/signals/intent_graph.json`;
    const graphData = await this.gcs.download(graphPath);
    const intents: unknown = JSON.parse(graphData.toString('utf-8'));

    const message = await anthropic.messages.create({
      model: this.config.anthropicModel ?? 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a video editor creating a narrative structure for an edited video from a screen recording.

Intent graph (what the user was doing):
${JSON.stringify(intents, null, 2)}

Create a sequence of narrative beats that would make a compelling, clear edited video:
- Each beat is a segment of the final video
- Beats should flow logically (setup → action → result)
- Remove dead time, repetition, and errors
- Highlight key moments and achievements

Respond with a JSON array:
{
  "beatIndex": number,
  "beatType": "setup" | "action" | "result" | "transition" | "highlight",
  "title": "short title",
  "description": "what happens in this beat",
  "suggestedDurationMs": number,
  "startMs": number,
  "endMs": number,
  "relatedIntentIds": ["string"]
}`,
      }],
    });

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const signals: TaskResult['signals'] = [];

    try {
      const jsonMatch = extractJsonArray(responseText);
      if (jsonMatch) {
        const beats = JSON.parse(jsonMatch) as Array<{
          beatIndex: number;
          beatType: string;
          title: string;
          description: string;
          suggestedDurationMs: number;
          startMs: number;
          endMs: number;
          relatedIntentIds: string[];
        }>;

        for (const beat of beats) {
          signals.push({
            signalType: SignalType.NARRATIVE_BEAT,
            timestampMs: beat.startMs,
            durationMs: beat.endMs - beat.startMs,
            confidence: 0.85,
            payload: {
              beatIndex: beat.beatIndex,
              beatType: beat.beatType,
              title: beat.title,
              description: beat.description,
              suggestedDurationMs: beat.suggestedDurationMs,
              relatedIntentIds: beat.relatedIntentIds,
            },
          });
        }
      }
    } catch (err) {
      throw new Error(`Failed to parse narrative beats from LLM response: ${err instanceof Error ? err.message : String(err)}`);
    }

    const outputPath = `projects/${task.projectId}/signals/narrative_plan.json`;
    await this.gcs.upload(outputPath, Buffer.from(JSON.stringify(signals, null, 2)), 'application/json');

    return { outputAssetIds: [`narrative-${task.projectId}`], signals };
  }
}
