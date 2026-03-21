import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { restyleWorkflow } from "../workflows/restyle.ts";
import { createHttpClient } from "../http.ts";
import type { ImageModel } from "../image-backend.ts";
import { formatError } from "../errors/error-reporter.ts";

async function downloadToTemp(url: string): Promise<string> {
  const http = createHttpClient();
  const response = await http.request(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = path.extname(new URL(url).pathname) || ".png";
  const tempPath = path.join(os.tmpdir(), `kanario-restyle-${Date.now()}${ext}`);
  await fsp.writeFile(tempPath, buffer);
  return tempPath;
}

async function validateImage(filePath: string): Promise<void> {
  const metadata = await sharp(filePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Not a valid image: ${filePath}`);
  }
}

export async function restyle(
  positionals: string[],
  values: { "image-model"?: string; output?: string; hint?: string; background?: string; wide?: boolean; "no-wide"?: boolean },
) {
  const imageArg = positionals[1];

  if (!imageArg) {
    console.error("Usage: ./kanario restyle <image-path-or-url> [options]");
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

  let imagePath: string;
  let tempFile: string | undefined;

  try {
    // Download if URL, otherwise use local path
    if (/^https?:\/\//.test(imageArg)) {
      console.log(`Downloading ${imageArg} ...`);
      imagePath = await downloadToTemp(imageArg);
      tempFile = imagePath;
    } else {
      imagePath = imageArg;
    }

    // Validate it's a real image
    await validateImage(imagePath);

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
    console.log(`  ID: ${result.id}  (use with improve: ./kanario improve ${result.id} ...)`);

    const { execSync } = await import("node:child_process");
    execSync(`open ${result.outputDir}`);

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
