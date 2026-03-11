import { restyleWorkflow } from "../workflows/restyle.ts";
import type { ImageModel } from "../image-backend.ts";
import { formatError } from "../errors/error-reporter.ts";

export async function restyle(
  positionals: string[],
  values: { "image-model"?: string; output?: string; hint?: string; background?: string; wide?: boolean; "no-wide"?: boolean },
) {
  const imagePath = positionals[1];

  if (!imagePath) {
    console.error("Usage: ./kanario restyle <image-path> [options]");
    console.error("  Transforms an image into Kanario's isometric 3D Pixar style");
    console.error("");
    console.error("Options:");
    console.error('  --hint         Guide what to emphasize (e.g. "focus on the dashboard")');
    console.error("  --background   Background color: white, cream, mint, sky, slate, forest, navy, plum");
    console.error('  --image-model  Image backend: "qwen" (default)');
    console.error("  -o, --output   Custom output directory");
    console.error("  --no-wide      Disable 16:9 padding");
    process.exit(1);
  }

  const imageModelRaw = values["image-model"] || "qwen";
  const wide = values["no-wide"] ? false : (values.wide ?? true);

  if (imageModelRaw !== "qwen") {
    console.error(`Unknown image model "${imageModelRaw}". Choose "qwen".`);
    process.exit(1);
  }
  const imageModel: ImageModel = imageModelRaw;

  try {
    const result = await restyleWorkflow(
      {
        sourceImagePath: imagePath,
        imageModel,
        outputDir: values.output,
        wide,
        hint: values.hint,
        background: values.background,
      },
      (msg) => console.log(msg),
    );

    console.log(`\nDone! Restyled image saved to ${result.outputDir}`);

    const { execSync } = await import("node:child_process");
    execSync(`open ${result.outputDir}`);

    process.exit(0);
  } catch (err) {
    console.error(formatError(err));
    process.exit(1);
  }
}
