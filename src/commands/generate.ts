import type { ImageModel } from "../image-backend.ts";
import { credentialsFromEnv, createWpClient } from "../credentials.ts";
import { resolvePostId } from "../wordpress.ts";
import { generateWorkflow } from "../workflows/generate.ts";
import { formatError } from "../errors/error-reporter.ts";

export async function generate(
  positionals: string[],
  values: { hint?: string; model?: string; "image-model"?: string; output?: string; wide?: boolean; "no-wide"?: boolean },
) {
  const creds = credentialsFromEnv();
  if (!creds.wpUsername || !creds.wpAppPassword) {
    console.error("Missing WP_USERNAME or WP_APP_PASSWORD environment variables.");
    process.exit(1);
  }

  const wpHttp = createWpClient(creds);
  const postId = await resolvePostId(wpHttp, positionals[0]);
  const model = values.model;
  const imageModelRaw = values["image-model"] || "qwen";
  const outputDir = values.output;
  const wide = values["no-wide"] ? false : !!values.wide;
  const hint = values.hint;

  if (model !== "claude" && model !== "gemini") {
    console.error(`Unknown model "${model}". Choose "claude" or "gemini".`);
    process.exit(1);
  }

  if (imageModelRaw !== "qwen") {
    console.error(`Unknown image model "${imageModelRaw}". Choose "qwen".`);
    process.exit(1);
  }
  const imageModel: ImageModel = imageModelRaw;

  try {
    const result = await generateWorkflow(
      { wpHttp, postId, model, imageModel, outputDir, wide, hint },
      (msg) => console.log(msg),
    );
    console.log(`\nDone! Generated ${result.imagePaths.length} images in ${result.outputDir}`);
    process.exit(0);
  } catch (err) {
    console.error(formatError(err));
    process.exit(1);
  }
}
