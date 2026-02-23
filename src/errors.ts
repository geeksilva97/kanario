export class KanarioError<M extends Record<string, unknown> = Record<string, unknown>> extends Error {
  readonly type: string;
  readonly meta: M;

  // {} as M: TS can't prove {} satisfies a generic — safe because all subclass constructors pass real meta
  constructor(type: string, message: string, meta: M = {} as M) {
    super(message);
    this.name = this.constructor.name;
    this.type = type;
    this.meta = meta;
  }

  static is(err: unknown): err is KanarioError {
    return err instanceof KanarioError;
  }
}

export function parseWpErrorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.code === "string") return parsed.code;
  } catch {
    // not JSON
  }
  return null;
}

export type HttpErrorMeta = {
  method: string;
  url: string;
  status: number;
  statusText: string;
  body: string;
};

export class HttpError extends KanarioError<HttpErrorMeta> {
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

export type WordPressErrorMeta = {
  postId?: string;
  slug?: string;
  input?: string;
  status?: number;
  statusText?: string;
  wpCode?: string | null;
};

export class WordPressError extends KanarioError<WordPressErrorMeta> {
  static is(err: unknown): err is WordPressError {
    return err instanceof WordPressError;
  }

  static fetchFailed(postId: string, status: number, statusText: string, body: string) {
    return new WordPressError(
      "wp_fetch_failed",
      `Failed to fetch post ${postId}: ${status} ${statusText}`,
      { postId, status, statusText, wpCode: parseWpErrorCode(body) },
    );
  }

  static slugLookupFailed(slug: string, status: number, statusText: string, body: string) {
    return new WordPressError(
      "wp_slug_lookup_failed",
      `Slug lookup failed for "${slug}": ${status} ${statusText}`,
      { slug, status, statusText, wpCode: parseWpErrorCode(body) },
    );
  }

  static slugNotFound(slug: string) {
    return new WordPressError(
      "wp_slug_not_found",
      `No post found with slug "${slug}"`,
      { slug },
    );
  }

  static uploadFailed(status: number, statusText: string, body: string) {
    return new WordPressError(
      "wp_upload_failed",
      `Media upload failed: ${status} ${statusText}`,
      { status, statusText, wpCode: parseWpErrorCode(body) },
    );
  }

  static setFeaturedFailed(status: number, statusText: string, body: string) {
    return new WordPressError(
      "wp_set_featured_failed",
      `Setting featured image failed: ${status} ${statusText}`,
      { status, statusText, wpCode: parseWpErrorCode(body) },
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
      `Unknown image model "${model}". Choose "qwen" or "nano-banana".`,
      { model },
    );
  }
}

export type ConfigErrorMeta = {
  vars?: string[];
  model?: string;
};

export class ConfigError extends KanarioError<ConfigErrorMeta> {
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

export type FileErrorMeta = {
  imagePath?: string;
};

export class FileError extends KanarioError<FileErrorMeta> {
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
