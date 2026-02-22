import path from "node:path";
import { OUTPUT_DIR } from "../config.ts";
import { resolveImagePath } from "./pick.ts";
import { improveWorkflow } from "../workflows/improve.ts";
import type { ImageModel } from "../image-backend.ts";

export async function improve(
  positionals: string[],
  values: { prompt?: string; "image-model"?: string },
) {
  const rawPostId = positionals[1];
  const imageArg = positionals[2];
  const prompt = values.prompt;

  if (!rawPostId || !imageArg || !prompt) {
    console.error('Usage: ./kanario improve <post-id> <image> --prompt "your instructions"');
    console.error('  <image> can be a shorthand like "2" or a full file path');
    process.exit(1);
  }

  const postId = rawPostId;
  const imagePath = resolveImagePath(postId, imageArg);
  const imageModel = (values["image-model"] || "qwen") as ImageModel;
  const outputDir = path.join(OUTPUT_DIR, postId);

  if (imageModel !== "qwen" && imageModel !== "nano-banana") {
    console.error(`Unknown image model "${imageModel}". Choose "qwen" or "nano-banana".`);
    process.exit(1);
  }

  try {
    const result = await improveWorkflow(
      { sourceImagePath: imagePath, prompt, imageModel, outputDir },
      (msg) => console.log(msg),
    );
    console.log(`\nDone! Generated ${result.imagePaths.length} images in ${result.outputDir}`);

    // Open output folder
    const { execSync } = await import("node:child_process");
    execSync(`open ${result.outputDir}`);

    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
