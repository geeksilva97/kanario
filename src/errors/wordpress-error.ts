import { KanarioError } from "./kanario-error.ts";

export function parseWpErrorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.code === "string") return parsed.code;
  } catch {
    // not JSON
  }
  return null;
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
