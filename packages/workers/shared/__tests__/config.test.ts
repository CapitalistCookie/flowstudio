import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.WORKER_NAME = 'audio-extract';
    process.env.STDB_INTERNAL_HOST = 'localhost';
    process.env.GCS_BUCKET = 'flowstudio-assets';
    process.env.GCP_PROJECT_ID = 'my-project';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // T2.8 — loadConfig reads env vars
  test('reads WORKER_NAME and generates unique workerId', () => {
    const config = loadConfig();
    expect(config.workerName).toBe('audio-extract');
    expect(config.workerId).toMatch(/^audio-extract-/);
  });

  test('reads required env vars', () => {
    const config = loadConfig();
    expect(config.stdbHost).toBe('localhost:3000');
    expect(config.gcsBucket).toBe('flowstudio-assets');
    expect(config.gcsProjectId).toBe('my-project');
  });

  test('uses default values for optional fields', () => {
    const config = loadConfig();
    expect(config.stdbModule).toBe('flowstudio');
    expect(config.concurrency).toBe(2);
    expect(config.pollIntervalMs).toBe(1000);
    expect(config.healthPort).toBe(8080);
  });

  test('throws on missing required env var', () => {
    delete process.env.WORKER_NAME;
    expect(() => loadConfig()).toThrow('Missing required env var: WORKER_NAME');
  });

  test('uses custom port from STDB_INTERNAL_PORT', () => {
    process.env.STDB_INTERNAL_PORT = '5000';
    const config = loadConfig();
    expect(config.stdbHost).toBe('localhost:5000');
  });

  test('reads optional API keys', () => {
    process.env.DEEPGRAM_API_KEY = 'dgkey123';
    process.env.GOOGLE_AI_API_KEY = 'gaikey456';
    const config = loadConfig();
    expect(config.deepgramApiKey).toBe('dgkey123');
    expect(config.googleAiApiKey).toBe('gaikey456');
  });

  test('uses explicit WORKER_ID when set', () => {
    process.env.WORKER_ID = 'my-custom-id';
    const config = loadConfig();
    expect(config.workerId).toBe('my-custom-id');
  });

  test('overrides concurrency from env', () => {
    process.env.WORKER_CONCURRENCY = '8';
    const config = loadConfig();
    expect(config.concurrency).toBe(8);
  });
});
