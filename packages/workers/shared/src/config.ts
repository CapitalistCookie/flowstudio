/** Worker environment configuration loaded from env vars */
export interface WorkerConfig {
  /** SpacetimeDB connection */
  stdbHost: string;
  stdbModule: string;

  /** GCS */
  gcsBucket: string;
  gcsProjectId: string;

  /** Worker identity */
  workerId: string;
  workerName: string;
  concurrency: number;
  pollIntervalMs: number;

  /** Health server */
  healthPort: number;

  /** API Keys (optional, worker-specific) */
  deepgramApiKey?: string;
  googleAiApiKey?: string;
  vertexRegion?: string;
  vertexProjectId?: string;

  /** LLM model overrides */
  anthropicModel?: string;
  googleAiModel?: string;
}

export function loadConfig(): WorkerConfig {
  const required = (name: string): string => {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required env var: ${name}`);
    return val;
  };

  const optional = (name: string): string | undefined => process.env[name];

  const optionalInt = (name: string, defaultVal: number): number => {
    const val = process.env[name];
    return val ? parseInt(val, 10) : defaultVal;
  };

  return {
    stdbHost: required('STDB_INTERNAL_HOST') + ':' + (optional('STDB_INTERNAL_PORT') ?? '3000'),
    stdbModule: optional('STDB_MODULE') ?? 'flowstudio',
    gcsBucket: required('GCS_BUCKET'),
    gcsProjectId: required('GCP_PROJECT_ID'),
    workerId: optional('WORKER_ID') ?? `${optional('WORKER_NAME') ?? 'worker'}-${Date.now().toString(36)}`,
    workerName: required('WORKER_NAME'),
    concurrency: optionalInt('WORKER_CONCURRENCY', 2),
    pollIntervalMs: optionalInt('WORKER_POLL_INTERVAL_MS', 1000),
    healthPort: optionalInt('HEALTH_PORT', 8080),
    deepgramApiKey: optional('DEEPGRAM_API_KEY'),
    googleAiApiKey: optional('GOOGLE_AI_API_KEY'),
    vertexRegion: optional('VERTEX_REGION') ?? 'us-central1',
    vertexProjectId: optional('VERTEX_PROJECT_ID') ?? optional('GCP_PROJECT_ID'),
    anthropicModel: optional('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-20250514',
    googleAiModel: optional('GOOGLE_AI_MODEL') ?? 'gemini-2.5-pro',
  };
}
