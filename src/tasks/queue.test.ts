import { describe, expect, it } from 'vitest';
import { SequentialTaskQueue, type QueueTask } from './queue';

describe('SequentialTaskQueue', () => {
  it('runs tasks serially and reports each actual state transition', async () => {
    const queue = new SequentialTaskQueue<string, string>();
    const tasks: QueueTask<string>[] = [
      { id: 'one', input: 'one', status: 'pending' },
      { id: 'two', input: 'two', status: 'pending' },
    ];
    const updates: string[] = [];
    let active = 0;
    let maxActive = 0;

    await queue.run(tasks, async (input) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return input;
    }, (task) => updates.push(`${task.id}:${task.status}`));

    expect(maxActive).toBe(1);
    expect(updates).toEqual(['one:processing', 'one:completed', 'two:processing', 'two:completed']);
  });

  it('retains failed jobs and continues processing later jobs', async () => {
    const queue = new SequentialTaskQueue<string, string>();
    const tasks: QueueTask<string>[] = [
      { id: 'bad', input: 'bad', status: 'pending' },
      { id: 'good', input: 'good', status: 'pending' },
    ];
    const updates: Array<{ id: string; status: string; error?: string }> = [];
    await queue.run(tasks, async (input) => {
      if (input === 'bad') throw new Error('decode failed');
      return input;
    }, (task, error) => updates.push({ id: task.id, status: task.status, error: error?.message }));

    expect(updates).toContainEqual({ id: 'bad', status: 'failed', error: 'decode failed' });
    expect(updates).toContainEqual({ id: 'good', status: 'completed', error: undefined });
  });

  it('can retry a failed job and report it completed on the next run', async () => {
    const queue = new SequentialTaskQueue<string, string>();
    const task: QueueTask<string> = { id: 'retry', input: 'image', status: 'pending' };
    const updates: string[] = [];

    await queue.run([task], async () => {
      throw new Error('temporary processing failure');
    }, (current) => updates.push(current.status));

    await queue.run([{ ...task, status: 'pending' }], async (input) => input, (current) => updates.push(current.status));

    expect(updates).toEqual(['processing', 'failed', 'processing', 'completed']);
  });

  it('aborts the active job and skips remaining queued jobs', async () => {
    const queue = new SequentialTaskQueue<string, string>();
    const tasks: QueueTask<string>[] = [
      { id: 'active', input: 'active', status: 'pending' },
      { id: 'queued', input: 'queued', status: 'pending' },
    ];
    const updates: string[] = [];
    let started!: () => void;
    const activeStarted = new Promise<void>((resolve) => { started = resolve; });
    const run = queue.run(tasks, (_input, signal) => new Promise<string>((_resolve, reject) => {
      started();
      signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
    }), (task) => updates.push(`${task.id}:${task.status}`));
    await activeStarted;
    queue.cancel('active');
    queue.cancel('queued');
    await run;

    expect(updates).toEqual(['active:processing', 'active:cancelled', 'queued:cancelled']);
  });

  it('processes a full 100-image batch serially', async () => {
    const queue = new SequentialTaskQueue<number, number>();
    const tasks = Array.from({ length: 100 }, (_, index) => ({
      id: `image-${index}`,
      input: index,
      status: 'pending' as const,
    }));
    let active = 0;
    let maximumActive = 0;
    let completed = 0;

    await queue.run(tasks, async (input) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return input;
    }, (task) => {
      if (task.status === 'completed') completed += 1;
    });

    expect(completed).toBe(100);
    expect(maximumActive).toBe(1);
  });
});
