import { KanarioError, WordPressError, ImageBackendError, ConfigError, FileError } from "./errors.ts";

function getHint(err: KanarioError): string | null {
  if (err instanceof WordPressError) {
    const { status } = err.meta;
    if (status === 401 || status === 403) return "Check WP_USERNAME and WP_APP_PASSWORD — the credentials may be wrong or expired.";
    if (status === 404) return "The post ID may be wrong, or the post hasn't been saved as a draft yet.";
    return null;
  }

  if (err instanceof ImageBackendError) {
    if (err.type === "retries_exhausted") return "Vertex AI is rate-limiting. Wait a few minutes or switch to --image-model qwen.";
    return null;
  }

  if (err instanceof ConfigError) {
    if (err.type === "missing_env_vars") return "Set the missing variables in your .env file (CLI) or via Cloud Run env vars (Discord bot).";
    return null;
  }

  if (err instanceof FileError) {
    if (err.type === "image_not_found") return "Run ./kanario <post-id> first to generate images, then reference them by number.";
    return null;
  }

  return null;
}

export function formatError(err: unknown): string {
  if (KanarioError.is(err)) {
    const hint = getHint(err);
    return hint ? `${err.message}\n${hint}` : err.message;
  }

  if (err instanceof Error) return err.message;

  return String(err);
}
