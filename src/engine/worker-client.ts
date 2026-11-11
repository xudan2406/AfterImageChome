import { ImageEngineError, type ImageInspection, type ImageProcessingOptions, type ImageProcessingResult, type OutputCapabilities } from './types';

type WorkerSuccess =
  | { id: string; ok: true; operation: 'capabilities'; capabilities: OutputCapabilities }
  | { id: string; ok: true; operation: 'inspect'; inspection: ImageInspection }
  | { id: string; ok: true; operation: 'process'; result: ImageProcessingResult };

type WorkerFailure = {
  id: string;
  ok: false;
  error: { name: string; message: string; code?: string };
};

function runWorker<T>(
  operation: 'capabilities' | 'inspect' | 'process',
  getResult: (response: WorkerSuccess) => T,
  file?: File,
  options?: ImageProcessingOptions,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./image-processing.worker.ts', import.meta.url), { type: 'module' });
    const requestId = crypto.randomUUID();
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', handleAbort);
      worker.terminate();
      callback();
    };
    const handleAbort = () => {
      finish(() => reject(new DOMException('Image processing was cancelled.', 'AbortError')));
    };

    if (signal?.aborted) {
      worker.terminate();
      reject(new DOMException('Image processing was cancelled.', 'AbortError'));
      return;
    }
    signal?.addEventListener('abort', handleAbort, { once: true });

    worker.addEventListener('message', (event: MessageEvent<WorkerSuccess | WorkerFailure>) => {
      if (event.data.id !== requestId) return;
      if (event.data.ok === true) {
        if (event.data.operation !== operation) return;
        const value = getResult(event.data);
        finish(() => resolve(value));
      } else {
        const failure = event.data;
        finish(() => reject(new ImageEngineError(
          isEngineErrorCode(failure.error.code) ? failure.error.code : 'ENCODE_FAILED',
          failure.error.message,
        )));
      }
    });
    worker.addEventListener('error', (event) => {
      finish(() => reject(new ImageEngineError('ENCODE_FAILED', event.message || 'The image worker stopped unexpectedly.')));
    });
    worker.addEventListener('messageerror', () => {
      finish(() => reject(new ImageEngineError('ENCODE_FAILED', 'The image worker returned an unreadable result.')));
    });

    try {
      if (operation === 'capabilities') {
        worker.postMessage({ id: requestId, operation });
      } else if (file && operation === 'inspect') {
        worker.postMessage({ id: requestId, file, operation });
      } else if (file && operation === 'process' && options) {
        worker.postMessage({ id: requestId, file, operation, options });
      } else {
        throw new Error('The image worker request is missing required input.');
      }
    } catch (cause) {
      finish(() => reject(new ImageEngineError('ENCODE_FAILED', 'The image could not be sent to the processing worker.', { cause })));
    }
  });
}

export function inspectImageInWorker(file: File, signal?: AbortSignal): Promise<ImageInspection> {
  return runWorker('inspect', (response) => {
    if (response.operation !== 'inspect') throw new Error('The image worker returned the wrong operation result.');
    return response.inspection;
  }, file, undefined, signal);
}

export function processImageInWorker(file: File, options: ImageProcessingOptions, signal?: AbortSignal): Promise<ImageProcessingResult> {
  return runWorker('process', (response) => {
    if (response.operation !== 'process') throw new Error('The image worker returned the wrong operation result.');
    return response.result;
  }, file, options, signal);
}

export function detectOutputCapabilitiesInWorker(signal?: AbortSignal): Promise<OutputCapabilities> {
  return runWorker('capabilities', (response) => {
    if (response.operation !== 'capabilities') throw new Error('The image worker returned the wrong operation result.');
    return response.capabilities;
  }, undefined, undefined, signal);
}

function isEngineErrorCode(code: string | undefined): code is ImageEngineError['code'] {
  return code !== undefined && [
    'INVALID_OPTIONS',
    'UNSUPPORTED_INPUT',
    'DECODE_FAILED',
    'IMAGE_TOO_LARGE',
    'CANVAS_UNAVAILABLE',
    'CODEC_UNAVAILABLE',
    'ENCODE_FAILED',
  ].includes(code);
}
