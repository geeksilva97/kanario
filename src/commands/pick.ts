import path from "node:path";
import readline from "node:readline/promises";
import { OUTPUT_DIR } from "../config.ts";
import { fetchDraft, resolvePostId } from "../wordpress.ts";
import { pickWorkflow } from "../workflows/pick.ts";

export function resolveImagePath(postId: string, imageArg: string): string {
  if (/^\d+[a-z]?$/.test(imageArg)) {
    return path.join(OUTPUT_DIR, postId, `prompt-${imageArg}.png`);
  }
  return path.resolve(imageArg);
}

export async function pick(positionals: string[]) {
  const rawPostId = positionals[1];
  const imageArg = positionals[2];

  if (!rawPostId || !imageArg) {
    console.error("Usage: ./kanario pick <post-id-or-url> <image>");
    console.error('  <image> can be a shorthand like "2" or a full file path');
    process.exit(1);
  }

  const postId = await resolvePostId(rawPostId);
  const imagePath = resolveImagePath(postId, imageArg);

  // Fetch post title for confirmation display
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

  try {
    console.log(`\nUploading ${path.basename(imagePath)} ...`);
    const result = await pickWorkflow({ postId, imagePath });
    console.log(`  Media ID: ${result.mediaId}`);
    console.log(`\nDone! Featured image set for "${post.title}".`);
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
