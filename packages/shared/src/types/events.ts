import { TaskType, TaskStatus, ProjectStatus } from './enums.js';

/** Event when a task status changes */
export interface TaskStatusEvent {
  taskId: string;
  projectId: string;
  taskType: TaskType;
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  workerId: string;
  timestamp: number;
}

/** Event when project state changes */
export interface ProjectStateEvent {
  projectId: string;
  status: ProjectStatus;
  phase: string;
  completedCount: number;
  totalTasks: number;
  timestamp: number;
}

/** Event for new signal written */
export interface SignalWrittenEvent {
  signalId: string;
  projectId: string;
  taskId: string;
  signalType: string;
  timestamp: number;
}
