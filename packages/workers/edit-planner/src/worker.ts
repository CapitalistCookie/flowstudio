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

export class EditPlannerWorker extends BaseWorker {
  readonly taskType = TaskType.EDIT_PLAN;

  async processTask(task: TaskData): Promise<TaskResult> {
    const anthropic = new AnthropicVertex({
      region: this.config.vertexRegion ?? 'us-central1',
      projectId: this.config.vertexProjectId ?? this.config.gcsProjectId,
    });

    const narrativePath = `projects/${task.projectId}/signals/narrative_plan.json`;
    const narrativeData = await this.gcs.download(narrativePath);
    const beats: unknown = JSON.parse(narrativeData.toString('utf-8'));

    const message = await anthropic.messages.create({
      model: this.config.anthropicModel ?? 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a professional video editor. Convert these narrative beats into specific edit decisions.

Narrative beats:
${JSON.stringify(beats, null, 2)}

For each beat, decide specific edits:
- Cut points (where to start/end clips)
- Speed changes (speedup boring parts, slow important parts)
- Zoom/pan on important UI elements
- Transitions between beats

Respond with a JSON array:
{
  "editType": "cut" | "trim" | "speedup" | "slowdown" | "zoom" | "pan" | "transition" | "overlay",
  "sourceStartMs": number,
  "sourceEndMs": number,
  "outputStartMs": number,
  "outputEndMs": number,
  "parameters": { speed?: number, zoomLevel?: number, transitionType?: string, ... },
  "reasoning": "why this edit"
}`,
      }],
    });

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const signals: TaskResult['signals'] = [];

    try {
      const jsonMatch = extractJsonArray(responseText);
      if (jsonMatch) {
        const edits = JSON.parse(jsonMatch) as Array<{
          editType: string;
          sourceStartMs: number;
          sourceEndMs: number;
          outputStartMs: number;
          outputEndMs: number;
          parameters: Record<string, unknown>;
          reasoning: string;
        }>;

        for (const edit of edits) {
          signals.push({
            signalType: SignalType.EDIT_DECISION,
            timestampMs: edit.sourceStartMs,
            durationMs: edit.sourceEndMs - edit.sourceStartMs,
            confidence: 0.8,
            payload: {
              editType: edit.editType,
              sourceStartMs: edit.sourceStartMs,
              sourceEndMs: edit.sourceEndMs,
              outputStartMs: edit.outputStartMs,
              outputEndMs: edit.outputEndMs,
              parameters: edit.parameters,
              reasoning: edit.reasoning,
            },
          });
        }
      }
    } catch (err) {
      throw new Error(`Failed to parse edit decisions from LLM response: ${err instanceof Error ? err.message : String(err)}`);
    }

    const outputPath = `projects/${task.projectId}/signals/edit_plan.json`;
    await this.gcs.upload(outputPath, Buffer.from(JSON.stringify(signals, null, 2)), 'application/json');

    return { outputAssetIds: [`edit-plan-${task.projectId}`], signals };
  }
}
