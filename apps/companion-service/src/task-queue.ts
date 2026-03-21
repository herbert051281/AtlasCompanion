export type TaskState =
  | 'queued'
  | 'pending_approval'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

export type QueueTask = {
  id: string;
  action: string;
  state: TaskState;
  riskLevel?: 'low' | 'medium' | 'high';
  createdAt: number;
  updatedAt: number;
};

const allowedTransitions: Record<TaskState, TaskState[]> = {
  queued: ['running', 'cancelled', 'pending_approval'],
  pending_approval: ['queued', 'cancelled'],
  running: ['done', 'failed', 'cancelled'],
  done: [],
  failed: [],
  cancelled: [],
};

export class TaskQueue {
  private readonly tasks = new Map<string, QueueTask>();

  enqueue(input: { action: string; riskLevel?: 'low' | 'medium' | 'high' }): QueueTask {
    const now = Date.now();
    const task: QueueTask = {
      id: crypto.randomUUID(),
      action: input.action,
      riskLevel: input.riskLevel,
      state: 'queued',
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    return task;
  }

  get(id: string): QueueTask | undefined {
    return this.tasks.get(id);
  }

  all(): QueueTask[] {
    return [...this.tasks.values()];
  }

  transition(id: string, nextState: TaskState): QueueTask {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`task not found: ${id}`);
    }

    const allowed = allowedTransitions[task.state];
    if (!allowed.includes(nextState)) {
      throw new Error(`invalid transition: ${task.state} -> ${nextState}`);
    }

    const updated: QueueTask = {
      ...task,
      state: nextState,
      updatedAt: Date.now(),
    };

    this.tasks.set(id, updated);
    return updated;
  }
}
