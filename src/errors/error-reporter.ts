import { KanarioError, WordPressError, ImageBackendError, ConfigError, FileError } from "./index.ts";

const WP_CODE_HINTS: Record<string, string> = {
  rest_post_invalid_id: "The post ID doesn't exist or belongs to a different post type.",
  rest_forbidden_context: "The WordPress user can't access this post. Check that the user has edit permissions.",
  rest_post_incorrect_password: "The post is password-protected and the provided password is wrong.",
  rest_cannot_create: "The WordPress user lacks the upload_files capability.",
  rest_cannot_edit: "The WordPress user doesn't have permission to edit this post.",
  rest_invalid_featured_media: "The media ID is invalid — the upload may have failed or the file was deleted.",
  rest_upload_no_data: "The upload body was empty — the image file may be corrupt or unreadable.",
  rest_upload_sideload_error: "WordPress rejected the file — check that the file type is allowed and the server has disk space.",
  rest_upload_unknown_error: "WordPress rejected the file — check that the file type is allowed and the server has disk space.",
  rest_upload_file_too_big: "The image exceeds the WordPress upload size limit.",
  rest_upload_limited_space: "The WordPress site has run out of upload space.",
  rest_upload_hash_mismatch: "Content hash mismatch — try uploading again.",
  rest_forbidden_status: "The WordPress user can't query posts with this status. Check that the user has edit_posts capability.",
  db_update_error: "WordPress database write failed — contact the site admin.",
};

const WP_STATUS_HINTS: Record<number, string> = {
  401: "Check WP_USERNAME and WP_APP_PASSWORD — the credentials may be wrong or expired.",
  403: "The WordPress user lacks the required permissions for this action.",
  404: "The post ID may be wrong, or the post hasn't been saved as a draft yet.",
  500: "WordPress server error — contact the site admin.",
};

function getHint(err: KanarioError): string | null {
  if (err instanceof WordPressError) {
    const { wpCode, status } = err.meta;
    if (wpCode && WP_CODE_HINTS[wpCode]) return WP_CODE_HINTS[wpCode];
    if (status && WP_STATUS_HINTS[status]) return WP_STATUS_HINTS[status];
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
