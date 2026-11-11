import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectOutputCapabilitiesInWorker, processImageInWorker } from './worker-client';
import type { ImageProcessingOptions } from './types';
import { createResultsArchiveInWorker } from '../tasks/export-zip-client';

class MockWorker extends EventTarget {
  static instances: MockWorker[] = [];
  readonly terminate = vi.fn();
  readonly postMessage = vi.fn();

  constructor() {
    super();
    MockWorker.instances.push(this);
  }
}

const options: ImageProcessingOptions = {
  format: 'png',
  quality: 1,
  resize: { preserveAspectRatio: true },
  backgroundColor: '#ffffff',
};

afterEach(() => {
  vi.unstubAllGlobals();
  MockWorker.instances = [];
});

describe('worker client lifecycle', () => {
  it('terminates the worker after receiving a valid response', async () => {
    vi.stubGlobal('Worker', MockWorker);
    const result = detectOutputCapabilitiesInWorker();
    const worker = MockWorker.instances[0]!;
    const request = worker.postMessage.mock.calls[0]?.[0] as { id: string };
    worker.dispatchEvent(new MessageEvent('message', {
      data: {
        id: request.id,
        ok: true,
        operation: 'capabilities',
        capabilities: { jpeg: true, png: true, webp: true, avif: false },
      },
    }));

    await expect(result).resolves.toEqual({ jpeg: true, png: true, webp: true, avif: false });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates a cancelled image-processing worker and rejects with AbortError', async () => {
    vi.stubGlobal('Worker', MockWorker);
    const controller = new AbortController();
    const file = new File(['image'], 'image.png', { type: 'image/png' });
    const result = processImageInWorker(file, options, controller.signal);
    const worker = MockWorker.instances[0]!;
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('creates ZIP output in a worker and terminates it when complete', async () => {
    vi.stubGlobal('Worker', MockWorker);
    const blob = new Blob(['image bytes'], { type: 'image/png' });
    const result = createResultsArchiveInWorker([{
      id: 'one',
      filename: 'one.png',
      sourceSize: 11,
      status: 'completed',
      options,
      createdAt: 1,
      completedAt: 2,
      outputBlob: blob,
      outputFormat: 'png',
      outputSize: blob.size,
    }]);
    const worker = MockWorker.instances[0]!;
    const request = worker.postMessage.mock.calls[0]?.[0] as { id: string };
    const archive = new Blob(['zip bytes'], { type: 'application/zip' });
    worker.dispatchEvent(new MessageEvent('message', {
      data: { id: request.id, ok: true, blob: archive },
    }));

    await expect(result).resolves.toBe(archive);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
