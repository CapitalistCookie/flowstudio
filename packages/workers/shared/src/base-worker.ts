import { type TaskType } from '@flowstudio/shared';
import { type WorkerConfig, loadConfig } from './config.js';
import { Logger } from './logger.js';
import { Semaphore } from './semaphore.js';
import { GcsClient } from './gcs-client.js';
import { StdbClient } from './stdb-client.js';
import { startHealthServer, type HealthStatus } from './health.js';

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

/**
 * Abstract base class for all FlowStudio workers.
 * Handles SpacetimeDB connection, task claiming, GCS access, health checks,
 * and concurrency control. Subclasses implement processTask().
 */
export abstract class BaseWorker {
  protected readonly config: WorkerConfig;
  protected readonly logger: Logger;
  protected readonly semaphore: Semaphore;
  protected readonly gcs: GcsClient;
  protected readonly stdb: StdbClient;
  private running = false;
  private activeTasks = 0;
  private readonly startTime = Date.now();
  private readonly inFlightTaskIds = new Set<string>();

  /** The task type this worker handles */
  abstract readonly taskType: TaskType;

  constructor() {
    this.config = loadConfig();
    this.logger = new Logger(this.config.workerName, this.config.workerId);
    this.semaphore = new Semaphore(this.config.concurrency);
    this.gcs = new GcsClient(this.config.gcsBucket, this.config.gcsProjectId, this.logger);
    this.stdb = new StdbClient({
      host: this.config.stdbHost,
      module: this.config.stdbModule,
      logger: this.logger,
    });
  }

  /**
   * Process a single task. Implemented by each worker.
   * Should download inputs from GCS, process them, upload outputs to GCS,
   * and return output asset IDs and signals.
   */
  abstract processTask(task: TaskData): Promise<TaskResult>;

  /** Start the worker: connect to SpacetimeDB, start health server, begin polling */
  async start(): Promise<void> {
    this.logger.info(`Starting worker: ${this.config.workerName}`, {
      taskType: this.taskType,
      concurrency: this.config.concurrency,
      pollInterval: this.config.pollIntervalMs,
    });

    // Start health server
    startHealthServer(this.config.healthPort, () => this.getHealthStatus(), this.logger);

    // Register worker config
    await this.stdb.connect();
    await this.registerWorker();

    // Subscribe to task table for claimed task discovery
    this.stdb.onTableUpdate('tasks', (update) => {
      this.handleTaskTableUpdate(update);
    });

    // Start polling for tasks
    this.running = true;
    this.pollLoop();

    // Graceful shutdown
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
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

    this.stdb.disconnect();
    this.logger.info('Worker stopped');
    process.exit(0);
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.pollForTasks();
      } catch (err) {
        this.logger.error('Poll loop error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
    }
  }

  private async pollForTasks(): Promise<void> {
    // Only poll if we have capacity
    if (this.semaphore.activeCount >= this.config.concurrency) return;

    // Find and claim a pending task via the findAndClaimTask reducer
    try {
      await this.stdb.callReducer('findAndClaimTask', {
        taskType: this.taskType,
        workerId: this.config.workerId,
      });
      // If successful, the task table subscription will fire handleTaskTableUpdate
      // which routes the claimed task to handleClaimedTask
    } catch {
      // No task available or claim failed — this is normal
      return;
    }
  }

  /** Handle task table updates from SpacetimeDB subscription */
  private handleTaskTableUpdate(update: unknown): void {
    // Extract rows from the update — SpacetimeDB sends inserted/updated rows
    const rows = this.extractRows(update);
    for (const row of rows) {
      const task = row as Record<string, unknown>;
      // Process tasks claimed by this worker
      const taskId = task.id as string;
      if (
        task.status === 'claimed' &&
        task.workerId === this.config.workerId &&
        task.taskType === this.taskType &&
        !this.inFlightTaskIds.has(taskId)
      ) {
        this.inFlightTaskIds.add(taskId);
        const taskData: TaskData = {
          id: taskId,
          projectId: task.projectId as string,
          taskType: task.taskType as string,
          inputAssetIds: JSON.parse((task.inputAssetIds as string) || '[]'),
          config: JSON.parse((task.config as string) || '{}'),
        };
        this.handleClaimedTask(taskData)
          .catch((err) => {
            this.logger.error('Error handling claimed task', {
              taskId: taskData.id,
              error: err instanceof Error ? err.message : String(err),
            });
          })
          .finally(() => {
            this.inFlightTaskIds.delete(taskId);
          });
      }
    }
  }

  /** Extract row data from a SpacetimeDB table update message */
  private extractRows(update: unknown): unknown[] {
    if (!update || typeof update !== 'object') return [];
    const u = update as Record<string, unknown>;
    // SpacetimeDB sends rows in various formats; handle common ones
    if (Array.isArray(u.inserts)) return u.inserts;
    if (Array.isArray(u.updates)) return u.updates;
    if (Array.isArray(u.rows)) return u.rows;
    return [];
  }

  /** Called when a task is claimed successfully (from subscription) */
  protected async handleClaimedTask(task: TaskData): Promise<void> {
    await this.semaphore.run(async () => {
      this.activeTasks++;
      this.logger.info(`Processing task ${task.id}`, { taskType: task.taskType, projectId: task.projectId });

      try {
        const result = await this.processTask(task);

        // Write signals
        for (const signal of result.signals) {
          await this.stdb.callReducer('writeSignal', {
            projectId: task.projectId,
            taskId: task.id,
            signalType: signal.signalType,
            timestampMs: signal.timestampMs,
            durationMs: signal.durationMs,
            confidence: signal.confidence,
            payload: JSON.stringify(signal.payload),
          });
        }

        // Complete the task
        await this.stdb.callReducer('completeTask', {
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

        await this.stdb.callReducer('failTask', {
          taskId: task.id,
          failureReason: reason,
        });
      } finally {
        this.activeTasks--;
      }
    });
  }

  private async registerWorker(): Promise<void> {
    await this.stdb.callReducer('updateWorkerConfig', {
      workerId: this.config.workerId,
      workerType: this.taskType,
      isActive: true,
      concurrency: this.config.concurrency,
      metadata: '{}',
    });
  }

  private getHealthStatus(): HealthStatus {
    return {
      healthy: this.running && this.stdb.isConnected,
      workerName: this.config.workerName,
      workerId: this.config.workerId,
      activeTasks: this.activeTasks,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}
