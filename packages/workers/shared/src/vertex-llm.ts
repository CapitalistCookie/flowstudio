import { VertexAI } from '@google-cloud/vertexai';
import type { WorkerConfig } from './config.js';

export interface LlmCallOptions {
  maxTokens: number;
  prompt: { system: string; user: string };
}

export async function callVertexLlm(config: WorkerConfig, options: LlmCallOptions): Promise<string> {
  const vertexAI = new VertexAI({
    project: config.vertexProjectId ?? config.gcsProjectId,
    location: config.vertexRegion ?? 'us-central1',
  });
  const model = vertexAI.getGenerativeModel({
    model: config.googleAiModel ?? 'gemini-2.5-pro',
    systemInstruction: { role: 'user', parts: [{ text: options.prompt.system }] },
  });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: options.prompt.user }] }],
    generationConfig: { maxOutputTokens: options.maxTokens },
  });
  return result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
