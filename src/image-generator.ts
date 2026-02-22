import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { ImageBackend, ImageModel } from "./image-backend.ts";
import { createQwenBackend } from "./qwen-backend.ts";
import { createNanoBananaBackend } from "./nano-banana-backend.ts";

export interface GenerateImageOptions {
  prompt: string;
  mascotPath?: string;
  outputDir: string;
  filenamePrefix: string;
}

export interface SingleImageOptions {
  prompt: string;
  mascotPath?: string;
  outputDir: string;
  filename: string;
  seed: number;
  wide?: boolean;
}

// Shared utilities used by backends

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

export async function padToWidescreen(mascotPath: string): Promise<string> {
  const mascot = sharp(mascotPath);
  const { width, height } = await mascot.metadata();
  if (!width || !height) throw new Error(`Cannot read dimensions of ${mascotPath}`);

  const scale = Math.min(CANVAS_HEIGHT / height, CANVAS_WIDTH / 3 / width);
  const resized = await mascot.resize(Math.round(width * scale), Math.round(height * scale)).toBuffer();

  const padded = await sharp({
    create: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();

  return padded.toString("base64");
}

export async function encodeMascot(mascotPath: string, wide: boolean): Promise<string> {
  if (wide) return padToWidescreen(mascotPath);
  return fs.readFileSync(mascotPath).toString("base64");
}

// Backend factory

export function createImageBackend(model: ImageModel): ImageBackend {
  switch (model) {
    case "qwen": return createQwenBackend();
    case "nano-banana": return createNanoBananaBackend();
    default: throw new Error(`Unknown image model "${model}". Choose "qwen" or "nano-banana".`);
  }
}

// Orchestration

export async function generateSingleImage(
  options: SingleImageOptions,
  backend: ImageBackend,
): Promise<string> {
  const { prompt, mascotPath, outputDir, filename, seed, wide = false } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`  Generating ${filename} ...`);

  const pngBuffer = await backend.generate({ prompt, mascotPath, seed, wide });

  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`  Saved ${filename} (${(pngBuffer.length / 1024).toFixed(0)} KB)`);

  return outputPath;
}

export async function generateImages(
  options: GenerateImageOptions,
  backend: ImageBackend,
): Promise<string[]> {
  const { prompt, mascotPath, outputDir, filenamePrefix } = options;

  const suffixes = ["a", "b"];

  const paths = await Promise.all(
    suffixes.map((suffix) =>
      generateSingleImage({
        prompt,
        mascotPath,
        outputDir,
        filename: `${filenamePrefix}${suffix}.png`,
        seed: -1,
      }, backend),
    ),
  );

  return paths;
}
