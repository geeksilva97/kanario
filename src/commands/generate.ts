import { parsePostId } from "../wordpress.ts";
import { generateWorkflow } from "../workflows/generate.ts";

export async function generate(
  positionals: string[],
  values: { hint?: string; model?: string; wide?: boolean; "no-wide"?: boolean },
) {
  const postId = parsePostId(positionals[0]);
  const model = values.model as string;
  const wide = values["no-wide"] ? false : (values.wide as boolean);
  const hint = values.hint;

  if (model !== "claude" && model !== "gemini") {
    console.error(`Unknown model "${model}". Choose "claude" or "gemini".`);
    process.exit(1);
  }

  try {
    const result = await generateWorkflow(
      { postId, model, wide, hint },
      (msg) => console.log(msg),
    );
    console.log(`\nDone! Generated ${result.imagePaths.length} images in ${result.outputDir}`);
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
