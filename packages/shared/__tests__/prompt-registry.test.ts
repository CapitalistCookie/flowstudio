import { describe, test, expect } from 'vitest';
import { PROMPT_REGISTRY } from '../src/prompt-registry.js';

describe('PROMPT_REGISTRY', () => {
  test('contains all three LLM worker prompts', () => {
    expect(PROMPT_REGISTRY).toHaveProperty('intent-graph');
    expect(PROMPT_REGISTRY).toHaveProperty('narrative-planner');
    expect(PROMPT_REGISTRY).toHaveProperty('edit-planner');
  });

  test('each prompt has required fields', () => {
    for (const [key, template] of Object.entries(PROMPT_REGISTRY)) {
      expect(template.name, `${key} missing name`).toBeTruthy();
      expect(template.description, `${key} missing description`).toBeTruthy();
      expect(template.systemPrompt, `${key} missing systemPrompt`).toBeTruthy();
      expect(template.userTemplate, `${key} missing userTemplate`).toBeTruthy();
      expect(template.defaultMaxTokens, `${key} missing defaultMaxTokens`).toBeGreaterThan(0);
    }
  });

  test('system prompts request JSON output', () => {
    for (const [key, template] of Object.entries(PROMPT_REGISTRY)) {
      expect(
        template.systemPrompt.toLowerCase(),
        `${key} systemPrompt should mention JSON`,
      ).toContain('json');
    }
  });

  test('intent-graph prompt mentions intent hierarchy', () => {
    const prompt = PROMPT_REGISTRY['intent-graph']!;
    expect(prompt.systemPrompt).toContain('intent');
    expect(prompt.systemPrompt).toContain('hierarchy');
  });

  test('narrative-planner prompt mentions beats', () => {
    const prompt = PROMPT_REGISTRY['narrative-planner']!;
    expect(prompt.systemPrompt).toContain('beat');
  });

  test('edit-planner prompt mentions edit types', () => {
    const prompt = PROMPT_REGISTRY['edit-planner']!;
    expect(prompt.systemPrompt).toContain('cut');
    expect(prompt.systemPrompt).toContain('zoom');
    expect(prompt.systemPrompt).toContain('speed');
  });
});
