import fs from "node:fs";
import type { HttpClient } from "./http.ts";
import { HttpError, WordPressError } from "./errors.ts";

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
  } catch {
    // not a URL, treat as raw post ID
  }
  return input;
}

async function fetchPostIdBySlug(
  http: HttpClient,
  slug: string,
): Promise<string> {
  let response: Response;
  try {
    response = await http.request(`/posts?slug=${encodeURIComponent(slug)}&_fields=id&status=any`);
  } catch (err) {
    if (HttpError.is(err)) {
      throw WordPressError.slugLookupFailed(slug, err.meta.status, err.meta.statusText, err.meta.body);
    }
    throw err;
  }

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
  let response: Response;
  try {
    response = await http.request(`/posts/${postId}`);
  } catch (err) {
    if (HttpError.is(err)) {
      throw WordPressError.fetchFailed(postId, err.meta.status, err.meta.statusText, err.meta.body);
    }
    throw err;
  }

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
  const body = fs.readFileSync(imagePath);

  let response: Response;
  try {
    response = await http.request("/media", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body,
    });
  } catch (err) {
    if (HttpError.is(err)) {
      throw WordPressError.uploadFailed(err.meta.status, err.meta.statusText, err.meta.body);
    }
    throw err;
  }

  const data = await response.json();
  return data.id;
}

export async function setFeaturedImage(
  http: HttpClient,
  postId: string,
  mediaId: number,
): Promise<void> {
  try {
    await http.request(`/posts/${postId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ featured_media: mediaId }),
    });
  } catch (err) {
    if (HttpError.is(err)) {
      throw WordPressError.setFeaturedFailed(err.meta.status, err.meta.statusText, err.meta.body);
    }
    throw err;
  }
}
