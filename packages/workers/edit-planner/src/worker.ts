import { TaskType, SignalType, buildSecurePrompt, validateOutput, PROMPT_REGISTRY, EditPlanOutputSchema } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

export class EditPlannerWorker extends BaseWorker {
  readonly taskType = TaskType.EDIT_PLAN;

  async processTask(task: TaskData): Promise<TaskResult> {
    const anthropic = new AnthropicVertex({
      region: this.config.vertexRegion ?? 'us-central1',
      projectId: this.config.vertexProjectId ?? this.config.gcsProjectId,
    });

    const narrativePath = `projects/${task.projectId}/signals/narrative_plan.json`;
    const narrativeData = await this.gcs.download(narrativePath);
    const beats = narrativeData.toString('utf-8');

    // Read prompt overrides from task config, falling back to registry defaults
    const registry = PROMPT_REGISTRY['edit-planner'];
    if (!registry) throw new Error('Missing prompt registry entry for edit-planner');
    const overrides = task.config.promptOverrides as Record<string, unknown> | undefined;
    const systemPrompt = (overrides?.systemPrompt as string) ?? registry.systemPrompt;
    const maxTokens = (overrides?.maxTokens as number) ?? registry.defaultMaxTokens;

    // Build secure prompt with system/user separation and XML-fenced data
    const prompt = buildSecurePrompt({
      systemPrompt,
      dataBlocks: [{
        label: 'narrative_beats',
        content: beats,
      }],
    });

    const message = await anthropic.messages.create({
      model: this.config.anthropicModel ?? 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    });

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';

    // Validate output against Zod schema
    const validation = validateOutput(responseText, EditPlanOutputSchema);
    if (!validation.parsed) {
      throw new Error(`Failed to parse edit decisions from LLM response: ${validation.errors?.join('; ')}`);
    }

    const signals: TaskResult['signals'] = validation.parsed.map(edit => ({
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
    }));

    const outputPath = `projects/${task.projectId}/signals/edit_plan.json`;
    await this.gcs.upload(outputPath, Buffer.from(JSON.stringify(signals, null, 2)), 'application/json');

    return { outputAssetIds: [`edit-plan-${task.projectId}`], signals };
  }
}
