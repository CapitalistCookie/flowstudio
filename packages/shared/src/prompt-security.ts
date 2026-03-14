import { z } from 'zod';

/**
 * Strip control characters, Unicode direction overrides, and escape XML delimiters.
 * Truncates to maxLength and collapses excessive newlines.
 */
export function sanitizeText(text: string, maxLength = 10000): string {
  let result = text;

  // Strip control chars (0x00-0x1F) except tab (0x09), newline (0x0A), carriage return (0x0D)
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // Strip Unicode direction overrides (U+200E-U+200F, U+202A-U+202E, U+2066-U+2069)
  result = result.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');

  // Escape < and > to prevent breaking XML fences
  result = result.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Truncate
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
  }

  // Collapse runs of 3+ newlines into 2
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

export interface DataBlock {
  label: string;
  content: string;
  maxLength?: number;
}

export interface SecurePromptInput {
  systemPrompt: string;
  dataBlocks: DataBlock[];
  userInstructions?: string;
}

export interface SecurePromptOutput {
  system: string;
  user: string;
}

/**
 * Build a secure prompt with system/user separation and XML-fenced data blocks.
 * Instructions go in the system role; data goes in XML-fenced user messages.
 */
export function buildSecurePrompt(input: SecurePromptInput): SecurePromptOutput {
  const { systemPrompt, dataBlocks, userInstructions } = input;

  const fencedBlocks = dataBlocks.map(block => {
    const sanitized = sanitizeText(block.content, block.maxLength);
    const safeLabel = block.label.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `<signal_data type="${safeLabel}">\n${sanitized}\n</signal_data>`;
  }).join('\n\n');

  let user = fencedBlocks;
  if (userInstructions) {
    user += `\n\n${userInstructions}`;
  }

  return {
    system: systemPrompt,
    user,
  };
}

/**
 * Extract a JSON array from LLM response text using string-aware bracket counting.
 * Handles brackets inside JSON string values correctly.
 */
export function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export interface ValidationResult<T> {
  parsed: T | null;
  raw: string;
  errors: string[] | null;
  confidence: number;
}

/**
 * Extract JSON from LLM output and validate against a Zod schema.
 * Returns parsed data, raw text, errors, and a confidence score.
 */
export function validateOutput<T>(raw: string, schema: z.ZodType<T>): ValidationResult<T> {
  const jsonStr = extractJsonArray(raw);
  if (!jsonStr) {
    return { parsed: null, raw, errors: ['No JSON array found in response'], confidence: 0 };
  }

  let jsonParsed: unknown;
  try {
    jsonParsed = JSON.parse(jsonStr);
  } catch (err) {
    return {
      parsed: null,
      raw,
      errors: [`JSON parse error: ${err instanceof Error ? err.message : String(err)}`],
      confidence: 0.25,
    };
  }

  const result = schema.safeParse(jsonParsed);
  if (result.success) {
    return { parsed: result.data, raw, errors: null, confidence: 1 };
  }

  // Valid JSON but schema mismatch
  const errors = result.error.issues.map(
    issue => `${issue.path.join('.')}: ${issue.message}`
  );

  return { parsed: null, raw, errors, confidence: 0.5 };
}
