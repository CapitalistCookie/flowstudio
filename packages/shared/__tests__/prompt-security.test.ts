import { describe, test, expect } from 'vitest';
import {
  sanitizeText,
  buildSecurePrompt,
  extractJsonArray,
  validateOutput,
} from '../src/prompt-security.js';
import { EditPlanOutputSchema } from '../src/schemas.js';

// ─── sanitizeText ─────────────────────────────────────────────────────────────
describe('sanitizeText', () => {
  // ─── T1.8: Strips control characters ──────────────────────────────────────
  test('removes control chars but keeps tabs/newlines', () => {
    const input = 'hello\x00world\tnewline\n';
    const result = sanitizeText(input);
    expect(result).toBe('helloworld\tnewline\n');
  });

  // ─── T1.9: Strips Unicode direction overrides ─────────────────────────────
  test('removes unicode direction overrides', () => {
    const result = sanitizeText('hello\u202Aworld\u200Etest\u2066end');
    expect(result).not.toContain('\u202A');
    expect(result).not.toContain('\u200E');
    expect(result).not.toContain('\u2066');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  // ─── T1.10: Truncates ─────────────────────────────────────────────────────
  test('truncates to maxLength', () => {
    const long = 'a'.repeat(20000);
    expect(sanitizeText(long, 100).length).toBe(100);
  });

  test('does not truncate within limit', () => {
    const short = 'hello world';
    expect(sanitizeText(short, 100)).toBe('hello world');
  });

  test('escapes angle brackets', () => {
    const result = sanitizeText('<script>alert("xss")</script>');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  test('collapses excessive newlines', () => {
    const result = sanitizeText('line1\n\n\n\n\nline2');
    expect(result).toBe('line1\n\nline2');
  });

  test('preserves double newlines', () => {
    const result = sanitizeText('line1\n\nline2');
    expect(result).toBe('line1\n\nline2');
  });
});

// ─── extractJsonArray ─────────────────────────────────────────────────────────
describe('extractJsonArray', () => {
  // ─── T1.11: Nested arrays ─────────────────────────────────────────────────
  test('handles nested arrays', () => {
    const text = 'Here is the result: [{"a": [1, 2]}, {"b": [3]}] end';
    const result = extractJsonArray(text);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toEqual([{ a: [1, 2] }, { b: [3] }]);
  });

  // ─── T1.12: No JSON ──────────────────────────────────────────────────────
  test('returns null for no array', () => {
    expect(extractJsonArray('no json here')).toBeNull();
  });

  // ─── T1.13: Brackets in strings ──────────────────────────────────────────
  test('handles brackets inside JSON strings', () => {
    const text = '[{"text": "array [1,2] in string"}]';
    const result = extractJsonArray(text);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toEqual([{ text: 'array [1,2] in string' }]);
  });

  test('handles deeply nested JSON', () => {
    const text = '[[[[["deep"]]]]]';
    const result = extractJsonArray(text);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toEqual([[[[['deep']]]]]);
  });

  test('handles escaped quotes in strings', () => {
    const text = '[{"key": "value with \\"quotes\\""}]';
    const result = extractJsonArray(text);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toEqual([{ key: 'value with "quotes"' }]);
  });

  test('returns null for unmatched brackets (truncated LLM response)', () => {
    const text = '[{"key": "value"}, {';
    expect(extractJsonArray(text)).toBeNull();
  });

  test('extracts first complete array from response with surrounding text', () => {
    const text = `Sure! Here is my analysis:

[{"editType": "cut", "sourceStartMs": 0, "sourceEndMs": 5000}]

I hope this helps!`;
    const result = extractJsonArray(text);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toEqual([
      { editType: 'cut', sourceStartMs: 0, sourceEndMs: 5000 },
    ]);
  });

  test('handles empty array', () => {
    const result = extractJsonArray('result: []');
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toEqual([]);
  });
});

// ─── validateOutput ───────────────────────────────────────────────────────────
describe('validateOutput', () => {
  // ─── T1.14: Full pipeline ─────────────────────────────────────────────────
  test('returns parsed data and confidence 1 on valid input', () => {
    const raw = `[{"editType": "cut", "sourceStartMs": 0, "sourceEndMs": 5000, "outputStartMs": 0, "outputEndMs": 5000, "parameters": {}, "reasoning": "trim intro"}]`;
    const result = validateOutput(raw, EditPlanOutputSchema);
    expect(result.confidence).toBe(1);
    expect(result.parsed).not.toBeNull();
    expect(result.errors).toBeNull();
  });

  test('returns confidence 0 when no JSON found', () => {
    const result = validateOutput('I cannot help with that', EditPlanOutputSchema);
    expect(result.confidence).toBe(0);
    expect(result.parsed).toBeNull();
    expect(result.errors).toContain('No JSON array found in response');
  });

  test('returns confidence 0.25 on malformed JSON', () => {
    const result = validateOutput('[{invalid json}]', EditPlanOutputSchema);
    expect(result.confidence).toBe(0.25);
    expect(result.parsed).toBeNull();
  });

  test('returns confidence 0.5 on valid JSON but schema mismatch', () => {
    const result = validateOutput('[{"wrong": "keys"}]', EditPlanOutputSchema);
    expect(result.confidence).toBe(0.5);
    expect(result.parsed).toBeNull();
    expect(result.errors).not.toBeNull();
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});

// ─── buildSecurePrompt ────────────────────────────────────────────────────────
describe('buildSecurePrompt', () => {
  // ─── T1.15: XML fencing ───────────────────────────────────────────────────
  test('wraps data in XML fences', () => {
    const result = buildSecurePrompt({
      systemPrompt: 'Analyze this',
      dataBlocks: [{ label: 'speech', content: 'hello world' }],
    });
    expect(result.system).toBe('Analyze this');
    expect(result.user).toContain('<signal_data type="speech">');
    expect(result.user).toContain('hello world');
    expect(result.user).toContain('</signal_data>');
  });

  test('sanitizes special chars in labels', () => {
    const result = buildSecurePrompt({
      systemPrompt: 'test',
      dataBlocks: [{ label: 'bad/label<>chars', content: 'data' }],
    });
    // Special chars replaced with underscores
    expect(result.user).toContain('type="bad_label__chars"');
  });

  test('includes user instructions after data blocks', () => {
    const result = buildSecurePrompt({
      systemPrompt: 'test',
      dataBlocks: [{ label: 'data', content: 'content' }],
      userInstructions: 'Please analyze carefully',
    });
    expect(result.user).toContain('Please analyze carefully');
    // Instructions come after the data
    const dataEnd = result.user.indexOf('</signal_data>');
    const instructionsStart = result.user.indexOf('Please analyze');
    expect(instructionsStart).toBeGreaterThan(dataEnd);
  });

  test('handles multiple data blocks', () => {
    const result = buildSecurePrompt({
      systemPrompt: 'test',
      dataBlocks: [
        { label: 'speech', content: 'hello' },
        { label: 'video', content: 'frames' },
      ],
    });
    expect(result.user).toContain('type="speech"');
    expect(result.user).toContain('type="video"');
  });

  test('sanitizes content within data blocks', () => {
    const result = buildSecurePrompt({
      systemPrompt: 'test',
      dataBlocks: [{ label: 'data', content: '<script>evil</script>' }],
    });
    expect(result.user).not.toContain('<script>');
    expect(result.user).toContain('&lt;script&gt;');
  });

  test('respects maxLength on data blocks', () => {
    const longContent = 'x'.repeat(50000);
    const result = buildSecurePrompt({
      systemPrompt: 'test',
      dataBlocks: [{ label: 'data', content: longContent, maxLength: 100 }],
    });
    // The content inside the fence should be truncated
    const fenceContent = result.user
      .replace(/<signal_data[^>]*>\n/, '')
      .replace('\n</signal_data>', '');
    expect(fenceContent.length).toBeLessThanOrEqual(100);
  });
});
