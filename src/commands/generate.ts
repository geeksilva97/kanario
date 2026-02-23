import type { ImageModel } from "../image-backend.ts";
import { credentialsFromEnv } from "../credentials.ts";
import { resolvePostId } from "../wordpress.ts";
import { generateWorkflow } from "../workflows/generate.ts";
import { formatError } from "../error-reporter.ts";

export async function generate(
  positionals: string[],
  values: { hint?: string; model?: string; "image-model"?: string; output?: string; wide?: boolean; "no-wide"?: boolean },
) {
  const creds = credentialsFromEnv();
  if (!creds.wpUsername || !creds.wpAppPassword) {
    console.error("Missing WP_USERNAME or WP_APP_PASSWORD environment variables.");
    process.exit(1);
  }

  const postId = await resolvePostId(creds, positionals[0]);
  const model = values.model as string;
  const imageModel = (values["image-model"] || "qwen") as ImageModel;
  const outputDir = values.output;
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
      { creds, postId, model, imageModel, outputDir, wide, hint },
      (msg) => console.log(msg),
    );
    console.log(`\nDone! Generated ${result.imagePaths.length} images in ${result.outputDir}`);
    process.exit(0);
  } catch (err) {
    console.error(formatError(err));
    process.exit(1);
  }
}
