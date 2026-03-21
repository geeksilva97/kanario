import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { OUTPUT_DIR } from "../config.ts";
import { credentialsFromEnv, createWpClient } from "../credentials.ts";
import { createHttpClient } from "../http.ts";
import { fetchDraft, resolvePostId } from "../wordpress.ts";
import { pickWorkflow } from "../workflows/pick.ts";
import { formatError } from "../errors/error-reporter.ts";

export function resolveImagePath(postId: string, imageArg: string): string {
  // URL: pass through as-is (caller handles download)
  if (/^https?:\/\//.test(imageArg)) {
    return imageArg;
  }
  // Shorthand: "2" → output/<postId>/prompt-2.png
  if (/^\d+[a-z]?$/.test(imageArg)) {
    return path.join(OUTPUT_DIR, postId, `prompt-${imageArg}.png`);
  }
  return path.resolve(imageArg);
}

async function downloadToTemp(url: string): Promise<string> {
  const http = createHttpClient();
  const response = await http.request(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = path.extname(new URL(url).pathname) || ".png";
  const tempPath = path.join(os.tmpdir(), `kanario-pick-${Date.now()}${ext}`);
  await fsp.writeFile(tempPath, buffer);
  return tempPath;
}

export async function pick(positionals: string[]) {
  const rawPostId = positionals[1];
  const imageArg = positionals[2];

  if (!rawPostId || !imageArg) {
    console.error("Usage: ./kanario pick <post-id-or-url> <image>");
    console.error('  <image> can be a shorthand like "2", an image URL, or a file path');
    process.exit(1);
  }

  const creds = credentialsFromEnv();
  if (!creds.wpUsername || !creds.wpAppPassword) {
    console.error("Missing WP_USERNAME or WP_APP_PASSWORD environment variables.");
    process.exit(1);
  }

  const wpHttp = createWpClient(creds);
  const postId = await resolvePostId(wpHttp, rawPostId);
  const resolved = resolveImagePath(postId, imageArg);

  let imagePath: string;
  let tempFile: string | undefined;

  try {
    // Download if URL, otherwise use local path
    if (/^https?:\/\//.test(resolved)) {
      console.log(`Downloading ${resolved} ...`);
      imagePath = await downloadToTemp(resolved);
      tempFile = imagePath;
    } else {
      imagePath = resolved;
    }

    // Fetch post title for confirmation display
    const post = await fetchDraft(wpHttp, postId);

    console.log(`\n  Post:  ${post.title}`);
    console.log(`  Image: ${imagePath}`);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("\nUpload and set as featured image? [y/N] ");
    rl.close();

    if (answer.toLowerCase() !== "y") {
      console.log("Aborted.");
      process.exit(0);
    }

    console.log(`\nUploading ${path.basename(imagePath)} ...`);
    const result = await pickWorkflow({ wpHttp, postId, imagePath });
    console.log(`  Media ID: ${result.mediaId}`);
    console.log(`\nDone! Featured image set for "${post.title}".`);
    process.exit(0);
  } catch (err) {
    console.error(formatError(err));
    process.exit(1);
  } finally {
    if (tempFile) {
      try { fs.unlinkSync(tempFile); } catch {}
    }
  }
}
