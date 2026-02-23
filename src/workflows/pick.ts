import fs from "node:fs";
import path from "node:path";
import type { WPCredentials } from "../credentials.ts";
import { uploadMedia, setFeaturedImage } from "../wordpress.ts";
import { FileError } from "../errors.ts";

export interface PickOptions {
  creds: WPCredentials;
  postId: string;
  imagePath: string;
}

export interface PickResult {
  mediaId: number;
}

export async function pickWorkflow(options: PickOptions): Promise<PickResult> {
  const { creds, postId, imagePath } = options;

  // Validate file exists (cheap local check first)
  if (!fs.existsSync(imagePath)) {
    throw FileError.imageNotFound(imagePath);
  }

  // Upload
  const filename = path.basename(imagePath);
  const mediaId = await uploadMedia(creds, imagePath, filename);

  // Set featured image
  await setFeaturedImage(creds, postId, mediaId);

  return { mediaId };
}
