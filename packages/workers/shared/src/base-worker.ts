import { type TaskType } from '@flowstudio/shared';
import { type WorkerConfig, loadConfig } from './config.js';
import { Logger } from './logger.js';
import { Semaphore } from './semaphore.js';
import { GcsClient } from './gcs-client.js';
import { startHealthServer, type HealthStatus } from './health.js';
import { DbConnection } from './module_bindings/index.js';

/** Task data received from SpacetimeDB */
export interface TaskData {
  id: string;
  projectId: string;
  taskType: string;
  inputAssetIds: string[];
  config: Record<string, unknown>;
}

/** Result of processing a task */
export interface TaskResult {
  outputAssetIds: string[];
  signals: Array<{
    signalType: string;
    timestampMs: number;
    durationMs: number;
    confidence: number;
    payload: Record<string, unknown>;
  }>;
}

/** Dependencies that can be injected for testing */
export interface WorkerDeps {
  config: WorkerConfig;
  logger: Logger;
  gcs: GcsClient;
}

/**
 * Abstract base class for all FlowStudio workers.
 * Handles SpacetimeDB communication via native WebSocket SDK, task claiming,
 * GCS access, health checks, and concurrency control.
 * Subclasses implement processTask().
 *
 * Accepts optional dependency injection for testability. In production,
 * call with no arguments to load config from env vars.
 */
export abstract class BaseWorker {
  protected readonly config: WorkerConfig;
  protected readonly logger: Logger;
  protected readonly semaphore: Semaphore;
  protected readonly gcs: GcsClient;
  protected connection: DbConnection | null = null;
  private running = false;
  private activeTasks = 0;
  private readonly startTime = Date.now();
  private readonly processingTaskIds = new Set<string>();

  /** The task type this worker handles */
  abstract readonly taskType: TaskType;

  constructor(deps?: WorkerDeps) {
    if (deps) {
      this.config = deps.config;
      this.logger = deps.logger;
      this.gcs = deps.gcs;
    } else {
      this.config = loadConfig();
      this.logger = new Logger(this.config.workerName, this.config.workerId);
      this.gcs = new GcsClient(this.config.gcsBucket, this.config.gcsProjectId, this.logger);
    }
    this.semaphore = new Semaphore(this.config.concurrency);
  }

  /**
   * Process a single task. Implemented by each worker.
   * Should download inputs from GCS, process them, upload outputs to GCS,
   * and return output asset IDs and signals.
   */
  abstract processTask(task: TaskData): Promise<TaskResult>;

  /**
   * Get the source video GCS path for a project.
   * Checks SDK subscription cache first; falls back to listing GCS.
   */
  protected async getSourceVideoPath(projectId: string): Promise<string> {
    try {
      if (this.connection) {
        for (const asset of this.connection.db.assets.iter()) {
          const a = asset as any;
          if (a.projectId === projectId && a.assetType === 'source_video' && a.gcsPath) {
            return a.gcsPath as string;
          }
        }
      }
    } catch (err) {
      this.logger.warn('STDB assets cache lookup failed, falling back to GCS list', {
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    const prefix = `projects/${projectId}/source_video/`;
    const files = await this.gcs.listFiles(prefix);
    if (files.length === 0) {
      throw new Error(`No source video found for project ${projectId} (STDB empty, GCS list empty)`);
    }
    return files[0]!;
  }

  /** Start the worker: connect to SpacetimeDB, subscribe, start health server */
  async start(): Promise<void> {
    this.logger.info(`Starting worker: ${this.config.workerName}`, {
      taskType: this.taskType,
      concurrency: this.config.concurrency,
    });

    // Start health server first
    startHealthServer(this.config.healthPort, () => this.getHealthStatus(), this.logger);

    this.running = true;

    // Connect to SpacetimeDB via WebSocket
    try {
      await this.connectToStdb();
    } catch (err) {
      this.logger.warn('SpacetimeDB connection failed, starting poll fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fall back to polling if initial connection fails
      this.pollLoop();
    }

    // Graceful shutdown
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
  }

  /** Connect to SpacetimeDB via WebSocket and subscribe to tasks table */
  private connectToStdb(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const uri = `ws://${this.config.stdbHost}`;

      this.connection = DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(this.config.stdbModule)
        .onConnect(async (conn: any, _identity: any, _token: string) => {
          this.logger.info('Connected to SpacetimeDB via WebSocket');

          // Register worker
          try {
            await conn.reducers.updateWorkerConfig({
              workerId: this.config.workerId,
              workerType: this.taskType,
              isActive: true,
              concurrency: this.config.concurrency,
              metadata: '{}',
            });
          } catch (err) {
            this.logger.warn('Failed to register worker config', {
              error: err instanceof Error ? err.message : String(err),
            });
          }

          // Subscribe to tasks table
          conn.subscriptionBuilder()
            .onApplied(() => {
              this.logger.info('Subscription applied — watching for tasks');
              resolve();
            })
            .subscribe(['SELECT * FROM tasks']);

          // Wire task callbacks
          this.wireTaskCallbacks(conn);
        })
        .onConnectError((_ctx: any, err: Error) => {
          this.logger.error('SpacetimeDB connection error', { error: err.message });
          reject(err);
        })
        .onDisconnect((_ctx: any, err?: Error) => {
          this.logger.warn('SpacetimeDB disconnected', { error: err?.message ?? 'unknown' });
          // SDK auto-reconnects; if not, fall back to polling
          if (this.running && !this.connection?.isActive) {
            this.logger.info('Starting poll fallback after disconnect');
            this.pollLoop();
          }
        })
        .build();
    });
  }

  /** Wire onInsert/onUpdate callbacks on tasks table for reactive task claiming */
  private wireTaskCallbacks(conn: DbConnection) {
    // When a new pending task appears, try to claim it
    conn.db.tasks.onInsert((_ctx: any, row: any) => {
      if (row.status === 'pending' && row.taskType === this.taskType) {
        this.tryClaimTask(conn);
      }
    });

    // When a task transitions to claimed by this worker, process it
    conn.db.tasks.onUpdate((_ctx: any, oldRow: any, newRow: any) => {
      if (
        newRow.status === 'claimed' &&
        newRow.workerId === this.config.workerId &&
        newRow.taskType === this.taskType &&
        oldRow.status !== 'claimed' &&
        !this.processingTaskIds.has(newRow.id)
      ) {
        this.dispatchTask(newRow);
      }
    });
  }

  /** Attempt to claim a pending task via the findAndClaimTask reducer */
  private async tryClaimTask(conn: DbConnection) {
    if (this.semaphore.activeCount >= this.config.concurrency) return;

    try {
      await conn.reducers.findAndClaimTask({
        taskType: this.taskType,
        workerId: this.config.workerId,
      });
    } catch {
      // No pending task or reducer error — normal during idle periods
    }
  }

  /** Parse and dispatch a claimed task row for processing */
  private dispatchTask(row: any) {
    const taskId = row.id as string;
    this.processingTaskIds.add(taskId);

    let taskData: TaskData;
    try {
      taskData = {
        id: taskId,
        projectId: row.projectId as string,
        taskType: row.taskType as string,
        inputAssetIds: JSON.parse((row.inputAssetIds as string) || '[]'),
        config: JSON.parse((row.config as string) || '{}'),
      };
    } catch (parseErr) {
      this.logger.error('Failed to parse task data, failing task', {
        taskId,
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      this.processingTaskIds.delete(taskId);
      this.connection?.reducers.failTask({
        taskId,
        failureReason: `Invalid task data: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      }).catch(() => {});
      return;
    }

    this.handleClaimedTask(taskData)
      .catch((err) => {
        this.logger.error('Error handling claimed task', {
          taskId,
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        this.processingTaskIds.delete(taskId);
      });
  }

  /** Called when a task is claimed successfully */
  protected async handleClaimedTask(task: TaskData): Promise<void> {
    await this.semaphore.run(async () => {
      this.activeTasks++;
      this.logger.info(`Processing task ${task.id}`, { taskType: task.taskType, projectId: task.projectId });

      try {
        const result = await this.processTask(task);
        const conn = this.connection;
        if (!conn) throw new Error('Not connected to SpacetimeDB');

        // Write signals
        for (const signal of result.signals) {
          await conn.reducers.writeSignal({
            projectId: task.projectId,
            taskId: task.id,
            signalType: signal.signalType,
            timestampMs: BigInt(signal.timestampMs),
            durationMs: BigInt(signal.durationMs),
            confidence: signal.confidence,
            payload: JSON.stringify(signal.payload),
          });
        }

        // Complete the task
        await conn.reducers.completeTask({
          taskId: task.id,
          outputAssetIds: JSON.stringify(result.outputAssetIds),
        });

        this.logger.info(`Task ${task.id} completed`, {
          outputAssets: result.outputAssetIds.length,
          signals: result.signals.length,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.error(`Task ${task.id} failed`, { error: reason });

        this.connection?.reducers.failTask({
          taskId: task.id,
          failureReason: reason,
        }).catch((failErr) => {
          this.logger.error('Failed to report task failure to SpacetimeDB', {
            taskId: task.id,
            error: failErr instanceof Error ? failErr.message : String(failErr),
          });
        });
      } finally {
        this.activeTasks--;
      }
    });
  }

  /** Stop the worker gracefully */
  async stop(): Promise<void> {
    this.logger.info('Stopping worker...');
    this.running = false;

    // Wait for active tasks to complete (with timeout)
    const timeout = 30_000;
    const start = Date.now();
    while (this.activeTasks > 0 && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.connection?.disconnect();
    this.logger.info('Worker stopped');
    process.exit(0);
  }

  /** Fallback poll loop (used when WebSocket is unavailable) */
  private async pollLoop(): Promise<void> {
    while (this.running) {
      if (this.connection?.isActive) {
        // WebSocket reconnected, stop polling
        this.logger.info('WebSocket reconnected, stopping poll loop');
        return;
      }
      try {
        if (this.connection) {
          await this.tryClaimTask(this.connection);
        }
      } catch (err) {
        this.logger.error('Poll loop error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
    }
  }

  private getHealthStatus(): HealthStatus {
    return {
      healthy: this.running,
      workerName: this.config.workerName,
      workerId: this.config.workerId,
      activeTasks: this.activeTasks,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}
