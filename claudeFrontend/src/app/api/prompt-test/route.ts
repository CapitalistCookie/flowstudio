import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import {
  buildSecurePrompt,
  validateOutput,
  WORKER_SCHEMAS,
  type WorkerType,
} from '@flowstudio/shared';

const RequestSchema = z.object({
  workerType: z.enum(['intent-graph', 'narrative-planner', 'edit-planner']),
  systemPrompt: z.string().min(1).max(50000),
  userTemplate: z.string().max(50000).optional(),
  signalData: z.string().max(500000),
  model: z.string().default('claude-sonnet-4-20250514'),
  maxTokens: z.number().min(256).max(8192).default(4096),
});

function checkAuth(request: NextRequest): NextResponse | null {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: 'ADMIN_API_KEY not configured' }, { status: 503 });
  }
  const provided = request.headers.get('x-admin-key');
  if (provided !== adminKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

// Singleton client — reuse across requests
let anthropicClient: AnthropicVertex | null = null;
function getAnthropicClient(): AnthropicVertex {
  if (!anthropicClient) {
    const region = process.env.VERTEX_REGION ?? 'us-central1';
    const projectId = process.env.VERTEX_PROJECT_ID ?? process.env.GCP_PROJECT_ID ?? '';
    anthropicClient = new AnthropicVertex({ region, projectId });
  }
  return anthropicClient;
}

export async function POST(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { workerType, systemPrompt, userTemplate, signalData, model, maxTokens } = parsed.data;

    // Determine data label based on worker type
    const labelMap: Record<WorkerType, string> = {
      'intent-graph': 'upstream_signals',
      'narrative-planner': 'intent_graph',
      'edit-planner': 'narrative_beats',
    };

    // Build secure prompt
    const prompt = buildSecurePrompt({
      systemPrompt,
      dataBlocks: [{ label: labelMap[workerType], content: signalData }],
      userInstructions: userTemplate && userTemplate !== '{{DATA}}' ? userTemplate : undefined,
    });

    const anthropic = getAnthropicClient();

    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    });
    const latencyMs = Date.now() - startTime;

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';

    // Validate output with appropriate schema (cast to ZodTypeAny to handle union)
    const schema = WORKER_SCHEMAS[workerType] as z.ZodTypeAny;
    const validation = validateOutput<unknown>(responseText, schema);

    return NextResponse.json({
      raw: responseText,
      parsed: validation.parsed,
      validationErrors: validation.errors,
      confidence: validation.confidence,
      metadata: {
        model,
        inputTokens: message.usage?.input_tokens ?? 0,
        outputTokens: message.usage?.output_tokens ?? 0,
        latencyMs,
        stopReason: message.stop_reason,
      },
      promptSent: { system: prompt.system, user: prompt.user },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Prompt test failed', details: msg }, { status: 500 });
  }
}
