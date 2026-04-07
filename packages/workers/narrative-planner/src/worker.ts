import { TaskType, SignalType, buildSecurePrompt, validateOutput, PROMPT_REGISTRY, NarrativePlanOutputSchema } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult, callVertexLlm } from '@flowstudio/worker-shared';

export class NarrativePlannerWorker extends BaseWorker {
  readonly taskType = TaskType.NARRATIVE_PLAN;

  async processTask(task: TaskData): Promise<TaskResult> {
    // Download intent graph
    const graphPath = `projects/${task.projectId}/signals/intent_graph.json`;
    const graphData = await this.gcs.download(graphPath);
    const intents = graphData.toString('utf-8');

    // Read prompt overrides from task config, falling back to registry defaults
    const registry = PROMPT_REGISTRY['narrative-planner'];
    if (!registry) throw new Error('Missing prompt registry entry for narrative-planner');
    const overrides = task.config.promptOverrides as Record<string, unknown> | undefined;
    const systemPrompt = (overrides?.systemPrompt as string) ?? registry.systemPrompt;
    const maxTokens = (overrides?.maxTokens as number) ?? registry.defaultMaxTokens;

    // Build secure prompt with system/user separation and XML-fenced data
    const prompt = buildSecurePrompt({
      systemPrompt,
      dataBlocks: [{
        label: 'intent_graph',
        content: intents,
      }],
    });

    const responseText = await callVertexLlm(this.config, { maxTokens, prompt });

    // Validate output against Zod schema
    const validation = validateOutput(responseText, NarrativePlanOutputSchema);
    if (!validation.parsed) {
      throw new Error(`Failed to parse narrative beats from LLM response: ${validation.errors?.join('; ')}`);
    }

    const signals: TaskResult['signals'] = validation.parsed.map(beat => ({
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
    }));

    const outputPath = `projects/${task.projectId}/signals/narrative_plan.json`;
    await this.gcs.upload(outputPath, Buffer.from(JSON.stringify(signals, null, 2)), 'application/json');

    return { outputAssetIds: [`narrative-${task.projectId}`], signals };
  }
}
