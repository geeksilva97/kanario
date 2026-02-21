import { config } from "./config.ts";

export interface WPPost {
  title: string;
  content: string;
  excerpt: string;
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

export async function fetchDraft(
  postId: string,
  wpUrl?: string,
): Promise<WPPost> {
  const baseUrl = wpUrl || config.wpUrl;
  const url = `${baseUrl}/wp-json/wp/v2/posts/${postId}`;
  const auth = Buffer.from(
    `${config.wpUsername}:${config.wpAppPassword}`,
  ).toString("base64");

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
