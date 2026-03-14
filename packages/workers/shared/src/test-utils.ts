/**
 * Test utilities for worker tests.
 * Provides mock dependencies so workers can be instantiated without
 * real env vars, GCS, or SpacetimeDB connections.
 */
import type { WorkerConfig } from './config.js';
import type { WorkerDeps } from './base-worker.js';

export interface MockGcsClient {
  upload: ReturnType<typeof import('vitest').vi.fn>;
  download: ReturnType<typeof import('vitest').vi.fn>;
  exists: ReturnType<typeof import('vitest').vi.fn>;
  getSignedUploadUrl: ReturnType<typeof import('vitest').vi.fn>;
  getSignedDownloadUrl: ReturnType<typeof import('vitest').vi.fn>;
}

export interface MockStdbClient {
  callReducer: ReturnType<typeof import('vitest').vi.fn>;
  queryTable: ReturnType<typeof import('vitest').vi.fn>;
  isConnected: boolean;
  disconnect: ReturnType<typeof import('vitest').vi.fn>;
}

export interface MockLogger {
  debug: ReturnType<typeof import('vitest').vi.fn>;
  info: ReturnType<typeof import('vitest').vi.fn>;
  warn: ReturnType<typeof import('vitest').vi.fn>;
  error: ReturnType<typeof import('vitest').vi.fn>;
}

export function createMockConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    stdbHost: 'localhost:3000',
    stdbModule: 'flowstudio',
    gcsBucket: 'test-bucket',
    gcsProjectId: 'test-project',
    workerId: 'test-worker-1',
    workerName: 'test-worker',
    concurrency: 2,
    pollIntervalMs: 100,
    healthPort: 0,
    deepgramApiKey: 'test-deepgram-key',
    googleAiApiKey: 'test-google-ai-key',
    vertexRegion: 'us-central1',
    vertexProjectId: 'test-project',
    googleAiModel: 'gemini-1.5-flash',
    anthropicModel: 'claude-sonnet-4-20250514',
    ...overrides,
  };
}

export function createMockGcs(): MockGcsClient {
  // Dynamic import to avoid requiring vitest at runtime
  const { vi } = require('vitest');
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(Buffer.from('[]')),
    exists: vi.fn().mockResolvedValue(true),
    getSignedUploadUrl: vi.fn().mockResolvedValue('https://signed-url.example.com/upload'),
    getSignedDownloadUrl: vi.fn().mockResolvedValue('https://signed-url.example.com/download'),
  };
}

export function createMockStdb(): MockStdbClient {
  const { vi } = require('vitest');
  return {
    callReducer: vi.fn().mockResolvedValue(undefined),
    queryTable: vi.fn().mockResolvedValue([]),
    isConnected: true,
    disconnect: vi.fn(),
  };
}

export function createMockLogger(): MockLogger {
  const { vi } = require('vitest');
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

export function createMockDeps(overrides: Partial<WorkerDeps> = {}): WorkerDeps {
  const config = overrides.config ?? createMockConfig();
  return {
    config,
    logger: overrides.logger ?? (createMockLogger() as any),
    gcs: overrides.gcs ?? (createMockGcs() as any),
    stdb: overrides.stdb ?? (createMockStdb() as any),
  };
}
