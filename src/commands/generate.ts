import type { ImageModel } from "../image-backend.ts";
import { resolvePostId } from "../wordpress.ts";
import { generateWorkflow } from "../workflows/generate.ts";

export async function generate(
  positionals: string[],
  values: { hint?: string; model?: string; "image-model"?: string; wide?: boolean; "no-wide"?: boolean },
) {
  const postId = await resolvePostId(positionals[0]);
  const model = values.model as string;
  const imageModel = (values["image-model"] || "qwen") as ImageModel;
  const wide = values["no-wide"] ? false : (values.wide as boolean);
  const hint = values.hint;

  if (model !== "claude" && model !== "gemini") {
    console.error(`Unknown model "${model}". Choose "claude" or "gemini".`);
    process.exit(1);
  }

  if (imageModel !== "qwen" && imageModel !== "nano-banana") {
    console.error(`Unknown image model "${imageModel}". Choose "qwen" or "nano-banana".`);
    process.exit(1);
  }

  try {
    const result = await generateWorkflow(
      { postId, model, imageModel, wide, hint },
      (msg) => console.log(msg),
    );
    console.log(`\nDone! Generated ${result.imagePaths.length} images in ${result.outputDir}`);
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
