import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { config, OUTPUT_DIR } from "../config.ts";
import {
  fetchDraft,
  parsePostId,
  uploadMedia,
  setFeaturedImage,
} from "../wordpress.ts";

export function resolveImagePath(postId: string, imageArg: string): string {
  if (/^\d+[a-z]$/.test(imageArg)) {
    return path.join(OUTPUT_DIR, postId, `prompt-${imageArg}.png`);
  }
  return path.resolve(imageArg);
}

export async function pick(positionals: string[]) {
  const rawPostId = positionals[1];
  const imageArg = positionals[2];

  if (!rawPostId || !imageArg) {
    console.error("Usage: ./kanario pick <post-id-or-url> <image>");
    console.error('  <image> can be a shorthand like "2a" or a full file path');
    process.exit(1);
  }

  const postId = parsePostId(rawPostId);

  // Validate WP credentials
  if (!config.wpUsername || !config.wpAppPassword) {
    console.error("Missing WP_USERNAME or WP_APP_PASSWORD environment variables.");
    process.exit(1);
  }

  // Resolve and validate image path
  const imagePath = resolveImagePath(postId, imageArg);
  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  // Fetch post title for confirmation
  const post = await fetchDraft(postId);

  console.log(`\n  Post:  ${post.title}`);
  console.log(`  Image: ${imagePath}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("\nUpload and set as featured image? [y/N] ");
  rl.close();

  if (answer.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  // Upload
  const filename = path.basename(imagePath);
  console.log(`\nUploading ${filename} ...`);
  const mediaId = await uploadMedia(imagePath, filename);
  console.log(`  Media ID: ${mediaId}`);

  // Set featured image
  console.log(`Setting featured image on post ${postId} ...`);
  await setFeaturedImage(postId, mediaId);

  console.log(`\nDone! Featured image set for "${post.title}".`);
  process.exit(0);
}
