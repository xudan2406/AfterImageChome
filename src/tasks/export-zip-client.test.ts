import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResultsArchiveInWorker } from './export-zip-client';

describe('createResultsArchiveInWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('terminates the ZIP worker and rejects when export is cancelled', async () => {
    const terminateMock = vi.fn();
    vi.stubGlobal('Worker', class extends EventTarget {
      terminate = terminateMock;
      postMessage = vi.fn();
    });

    const controller = new AbortController();
    const result = createResultsArchiveInWorker([], controller.signal);
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(terminateMock).toHaveBeenCalledOnce();
  });
});
