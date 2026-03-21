import fsp from "node:fs/promises";
import type { HttpClient } from "./http.ts";
import { HttpError, WordPressError } from "./errors/index.ts";

export interface WPPost {
  title: string;
  content: string;
  excerpt: string;
  summary?: string;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parsePostId(input: string): string {
  try {
    const url = new URL(input);
    const id = url.searchParams.get("post");
    if (id) return id;
  } catch (err) {
    // TypeError from URL constructor means input is not a valid URL
    // — treat as raw post ID. Re-throw other errors.
    if (!(err instanceof TypeError)) throw err;
  }
  return input;
}

function wrapHttpError<T>(promise: Promise<T>, transform: (err: HttpError) => WordPressError): Promise<T> {
  return promise.catch((err: unknown) => {
    if (HttpError.is(err)) throw transform(err);
    throw err;
  });
}

async function fetchPostIdBySlug(
  http: HttpClient,
  slug: string,
): Promise<string> {
  const response = await wrapHttpError(
    http.request(`/posts?slug=${encodeURIComponent(slug)}&_fields=id&status=any`),
    (err) => WordPressError.slugLookupFailed(slug, err.meta.status, err.meta.statusText, err.meta.body),
  );

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw WordPressError.slugNotFound(slug);
  }

  return String(data[0].id);
}

export async function resolvePostId(
  http: HttpClient,
  input: string,
): Promise<string> {
  const parsed = parsePostId(input);
  if (/^\d+$/.test(parsed)) return parsed;

  try {
    const url = new URL(parsed);
    const slug = url.pathname.replace(/^\/|\/$/g, "");
    if (!slug) {
      throw new Error("URL has no path to extract slug from");
    }
    return await fetchPostIdBySlug(http, slug);
  } catch (err) {
    if (err instanceof TypeError) {
      // new URL() failed — not a valid URL
      throw WordPressError.unresolvableInput(input);
    }
    throw err;
  }
}

export async function fetchDraft(
  http: HttpClient,
  postId: string,
): Promise<WPPost> {
  const response = await wrapHttpError(
    http.request(`/posts/${postId}`),
    (err) => WordPressError.fetchFailed(postId, err.meta.status, err.meta.statusText, err.meta.body),
  );

  const data = await response.json();

  return {
    title: stripHtml(data.title?.rendered || ""),
    content: stripHtml(data.content?.rendered || ""),
    excerpt: stripHtml(data.excerpt?.rendered || ""),
  };
}

export async function uploadMedia(
  http: HttpClient,
  imagePath: string,
  filename: string,
): Promise<number> {
  const body = new Uint8Array(await fsp.readFile(imagePath));

  const response = await wrapHttpError(
    http.request("/media", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body,
    }),
    (err) => WordPressError.uploadFailed(err.meta.status, err.meta.statusText, err.meta.body),
  );

  const data = await response.json();
  return data.id;
}

export async function setFeaturedImage(
  http: HttpClient,
  postId: string,
  mediaId: number,
): Promise<void> {
  await wrapHttpError(
    http.request(`/posts/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featured_media: mediaId }),
    }),
    (err) => WordPressError.setFeaturedFailed(err.meta.status, err.meta.statusText, err.meta.body),
  );
}
