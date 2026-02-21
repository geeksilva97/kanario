import fs from "node:fs";
import { config } from "../config.ts";
import { uploadMedia, setFeaturedImage } from "../wordpress.ts";
import path from "node:path";

export interface PickOptions {
  postId: string;
  imagePath: string;
}

export interface PickResult {
  mediaId: number;
}

export async function pickWorkflow(options: PickOptions): Promise<PickResult> {
  const { postId, imagePath } = options;

  // Validate file exists (cheap local check first)
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  // Validate WP credentials
  if (!config.wpUsername || !config.wpAppPassword) {
    throw new Error("Missing WP_USERNAME or WP_APP_PASSWORD environment variables.");
  }

  // Upload
  const filename = path.basename(imagePath);
  const mediaId = await uploadMedia(imagePath, filename);

  // Set featured image
  await setFeaturedImage(postId, mediaId);

  return { mediaId };
}
