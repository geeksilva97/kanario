import { KanarioError } from "./kanario-error.ts";

export type ImageBackendErrorMeta = {
  status?: number;
  body?: string;
  jobId?: string;
  statusPayload?: unknown;
  retries?: number;
  mascotPath?: string;
  model?: string;
};

export class ImageBackendError extends KanarioError<ImageBackendErrorMeta> {
  static is(err: unknown): err is ImageBackendError {
    return err instanceof ImageBackendError;
  }

  static runpodApiError(status: number, body: string) {
    return new ImageBackendError(
      "runpod_api_error",
      `RunPod API error: ${status} — ${body}`,
      { status, body },
    );
  }

  static downloadFailed(status: number) {
    return new ImageBackendError(
      "download_failed",
      `Image download failed: ${status}`,
      { status },
    );
  }

  static runpodJobFailed(jobId: string, statusPayload: unknown) {
    return new ImageBackendError(
      "runpod_job_failed",
      `RunPod job ${jobId} failed: ${JSON.stringify(statusPayload)}`,
      { jobId, statusPayload },
    );
  }

  static noImageData() {
    return new ImageBackendError(
      "no_image_data",
      "Nano Banana returned no image data",
      {},
    );
  }

  static retriesExhausted(retries: number) {
    return new ImageBackendError(
      "retries_exhausted",
      "Nano Banana: exhausted all retries",
      { retries },
    );
  }

  static unreadableMascot(mascotPath: string) {
    return new ImageBackendError(
      "unreadable_mascot",
      `Cannot read dimensions of ${mascotPath}`,
      { mascotPath },
    );
  }

  static unknownModel(model: string) {
    return new ImageBackendError(
      "unknown_image_model",
      `Unknown image model "${model}". Choose "qwen".`,
      { model },
    );
  }
}
