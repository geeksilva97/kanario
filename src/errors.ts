export class KanarioError extends Error {
  readonly type: string;
  readonly meta: Record<string, unknown>;

  constructor(type: string, message: string, meta: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.type = type;
    this.meta = meta;
  }

  static is(err: unknown): err is KanarioError {
    return err instanceof KanarioError;
  }
}

export class HttpError extends KanarioError {
  static is(err: unknown): err is HttpError {
    return err instanceof HttpError;
  }

  constructor(method: string, url: string, status: number, statusText: string, body: string) {
    super(
      "http_error",
      `${method} ${url} failed: ${status} ${statusText}`,
      { method, url, status, statusText, body },
    );
  }
}

export class WordPressError extends KanarioError {
  static is(err: unknown): err is WordPressError {
    return err instanceof WordPressError;
  }

  static slugNotFound(slug: string) {
    return new WordPressError(
      "wp_slug_not_found",
      `No post found with slug "${slug}"`,
      { slug },
    );
  }

  static unresolvableInput(input: string) {
    return new WordPressError(
      "wp_unresolvable_input",
      `Cannot resolve post from input: ${input}`,
      { input },
    );
  }
}

export class ImageBackendError extends KanarioError {
  static is(err: unknown): err is ImageBackendError {
    return err instanceof ImageBackendError;
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
      `Unknown image model "${model}". Choose "qwen" or "nano-banana".`,
      { model },
    );
  }
}

export class ConfigError extends KanarioError {
  static is(err: unknown): err is ConfigError {
    return err instanceof ConfigError;
  }

  static missingEnvVars(vars: string[]) {
    return new ConfigError(
      "missing_env_vars",
      `Missing environment variables: ${vars.join(", ")}`,
      { vars },
    );
  }

  static unknownModel(model: string) {
    return new ConfigError(
      "unknown_model",
      `Unknown model "${model}". Choose "claude" or "gemini".`,
      { model },
    );
  }
}

export class FileError extends KanarioError {
  static is(err: unknown): err is FileError {
    return err instanceof FileError;
  }

  static imageNotFound(imagePath: string) {
    return new FileError(
      "image_not_found",
      `Image not found: ${imagePath}`,
      { imagePath },
    );
  }
}
