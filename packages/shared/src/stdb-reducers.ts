/**
 * STDB Reducer Parameter Registry
 *
 * Single source of truth for SpacetimeDB reducer parameter names and order.
 * The STDB HTTP API expects a JSON ARRAY of positional arguments, not a
 * JSON object. This registry maps reducer names to their parameter order
 * so callers can serialize correctly.
 *
 * MUST stay in sync with packages/stdb-module/src/index.ts reducer definitions.
 */

export const REDUCER_PARAMS: Record<string, readonly string[]> = {
  createProject: ['name', 'ownerId', 'metadata'],
  createAsset: ['projectId', 'assetType', 'gcsPath', 'sizeBytes', 'mimeType', 'durationMs', 'metadata'],
  createTask: ['projectId', 'taskType', 'inputAssetIds', 'config', 'maxRetries'],
  claimTask: ['taskId', 'workerId'],
  findAndClaimTask: ['taskType', 'workerId'],
  completeTask: ['taskId', 'outputAssetIds'],
  failTask: ['taskId', 'failureReason'],
  writeSignal: ['projectId', 'taskId', 'signalType', 'timestampMs', 'durationMs', 'confidence', 'payload'],
  ingestInteractionBatch: ['projectId', 'taskId', 'signalType', 'batchJson'],
  updateProjectState: ['projectId', 'currentPhase', 'status'],
  updateWorkerConfig: ['workerId', 'workerType', 'isActive', 'concurrency', 'metadata'],
  toggleProjectStar: ['projectId'],
  createFolder: ['name', 'ownerId', 'color', 'sortOrder'],
  renameFolder: ['folderId', 'name'],
  deleteFolder: ['folderId'],
  moveProjectToFolder: ['projectId', 'folderId'],
  approveTimeline: ['projectId'],
  registerIdentity: ['firebaseUid'],
  registerWorkerIdentity: ['workerId', 'secret'],
} as const;

/**
 * Serialize reducer arguments from a named object to a positional JSON array.
 * The STDB HTTP API expects: POST /call/{reducer} with body ["arg1", "arg2", ...]
 */
export function serializeReducerArgs(
  reducerName: string,
  args: Record<string, unknown>,
): string {
  const params = REDUCER_PARAMS[reducerName];
  if (!params) {
    throw new Error(
      `Unknown reducer "${reducerName}". Add it to REDUCER_PARAMS in stdb-reducers.ts`,
    );
  }
  const positional = params.map((param) => {
    if (!(param in args)) {
      throw new Error(
        `Missing required parameter "${param}" for reducer "${reducerName}"`,
      );
    }
    return args[param];
  });
  return JSON.stringify(positional);
}

/**
 * Convert a camelCase reducer name to snake_case for the STDB HTTP API.
 * SpacetimeDB TS SDK normalizes reducer names to snake_case in WASM.
 */
export function reducerToSnakeCase(name: string): string {
  return name
    .replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
    .replace(/^_/, '');
}
