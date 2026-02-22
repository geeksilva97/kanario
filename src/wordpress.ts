import fs from "node:fs";
import type { WPCredentials } from "./credentials.ts";

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

function buildAuth(creds: WPCredentials): string {
  return Buffer.from(
    `${creds.wpUsername}:${creds.wpAppPassword}`,
  ).toString("base64");
}

async function fetchPostIdBySlug(
  creds: WPCredentials,
  slug: string,
): Promise<string> {
  const url = `${creds.wpUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=id&status=any`;
  const auth = buildAuth(creds);

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to look up slug "${slug}": ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No post found with slug "${slug}"`);
  }

  return String(data[0].id);
}

export async function resolvePostId(
  creds: WPCredentials,
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
    return await fetchPostIdBySlug(creds, slug);
  } catch (err) {
    if (err instanceof TypeError) {
      // new URL() failed — not a valid URL
      throw new Error(`Cannot resolve post from input: ${input}`);
    }
    throw err;
  }
}

export async function fetchDraft(
  creds: WPCredentials,
  postId: string,
): Promise<WPPost> {
  const url = `${creds.wpUrl}/wp-json/wp/v2/posts/${postId}`;
  const auth = buildAuth(creds);

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch post ${postId}: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  return {
    title: stripHtml(data.title?.rendered || ""),
    content: stripHtml(data.content?.rendered || ""),
    excerpt: stripHtml(data.excerpt?.rendered || ""),
  };
}

export async function uploadMedia(
  creds: WPCredentials,
  imagePath: string,
  filename: string,
): Promise<number> {
  const url = `${creds.wpUrl}/wp-json/wp/v2/media`;
  const auth = buildAuth(creds);

  const body = fs.readFileSync(imagePath);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to upload media: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return data.id;
}

export async function setFeaturedImage(
  creds: WPCredentials,
  postId: string,
  mediaId: number,
): Promise<void> {
  const url = `${creds.wpUrl}/wp-json/wp/v2/posts/${postId}`;
  const auth = buildAuth(creds);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ featured_media: mediaId }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to set featured image: ${response.status} ${response.statusText}`,
    );
  }
}
