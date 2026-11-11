import { browserImagePlatform, detectOutputCapabilities } from './browser-platform';
import { inspectImage, processImage } from './process-image';
import type { ImageInspection, ImageProcessingOptions, ImageProcessingResult, OutputCapabilities } from './types';

type WorkerRequest =
  | { id: string; operation: 'capabilities' }
  | { id: string; operation: 'inspect'; file: File }
  | { id: string; operation: 'process'; file: File; options: ImageProcessingOptions };

type WorkerResponse =
  | { id: string; ok: true; operation: 'capabilities'; capabilities: OutputCapabilities }
  | { id: string; ok: true; operation: 'inspect'; inspection: ImageInspection }
  | { id: string; ok: true; operation: 'process'; result: ImageProcessingResult }
  | { id: string; ok: false; error: { name: string; message: string; code?: string } };

type ImageWorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
  postMessage(message: WorkerResponse): void;
};

const workerScope = self as unknown as ImageWorkerScope;

workerScope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id } = event.data;
  const task = event.data.operation === 'capabilities'
    ? detectOutputCapabilities().then((capabilities) => {
      const response: WorkerResponse = { id, ok: true, operation: 'capabilities', capabilities };
      workerScope.postMessage(response);
    })
    : event.data.operation === 'inspect'
      ? inspectImage(event.data.file, browserImagePlatform).then(
        (inspection) => {
          const response: WorkerResponse = { id, ok: true, operation: 'inspect', inspection };
          workerScope.postMessage(response);
        },
      )
      : processImage(event.data.file, event.data.options, browserImagePlatform).then(
        (result) => {
          const response: WorkerResponse = { id, ok: true, operation: 'process', result };
          workerScope.postMessage(response);
        },
      );
  void task.catch((cause: unknown) => {
    const error = cause instanceof Error ? cause : new Error('Image processing failed.');
    const response: WorkerResponse = {
      id,
      ok: false,
      error: {
        name: error.name,
        message: error.message,
        ...(typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
          ? { code: cause.code }
          : {}),
      },
    };
    workerScope.postMessage(response);
  });
});
