export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type QueueTask<TInput> = {
  id: string;
  input: TInput;
  status: TaskStatus;
};

export type QueueUpdate<TInput> = (task: QueueTask<TInput>, error?: Error) => void;

export class SequentialTaskQueue<TInput, TResult> {
  private readonly cancelled = new Set<string>();
  private readonly activeControllers = new Map<string, AbortController>();
  private running = false;

  cancel(id: string): void {
    this.cancelled.add(id);
    this.activeControllers.get(id)?.abort();
  }

  forgetCancellation(id: string): void {
    this.cancelled.delete(id);
  }

  cancelAll(tasks: QueueTask<TInput>[]): void {
    for (const task of tasks) {
      if (task.status === 'pending' || task.status === 'processing') this.cancel(task.id);
    }
  }

  async run(
    tasks: QueueTask<TInput>[],
    execute: (input: TInput, signal: AbortSignal, task: QueueTask<TInput>) => Promise<TResult>,
    update: QueueUpdate<TInput>,
  ): Promise<void> {
    if (this.running) throw new Error('The task queue is already running.');
    this.running = true;
    try {
      for (const task of tasks) {
        if (task.status !== 'pending') continue;
        if (this.cancelled.delete(task.id)) {
          update({ ...task, status: 'cancelled' });
          continue;
        }

        const controller = new AbortController();
        this.activeControllers.set(task.id, controller);
        update({ ...task, status: 'processing' });
        try {
          await execute(task.input, controller.signal, task);
          update({
            ...task,
            status: controller.signal.aborted ? 'cancelled' : 'completed',
          });
        } catch (cause) {
          const error = cause instanceof Error ? cause : new Error('The task failed.');
          if (controller.signal.aborted || error.name === 'AbortError') {
            update({ ...task, status: 'cancelled' });
          } else {
            update({ ...task, status: 'failed' }, error);
          }
        } finally {
          this.activeControllers.delete(task.id);
          this.cancelled.delete(task.id);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
