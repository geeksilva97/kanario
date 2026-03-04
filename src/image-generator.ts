import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { HttpClient } from "./http.ts";
import type { ImageBackend, ImageModel } from "./image-backend.ts";
import { createQwenBackend } from "./qwen-backend.ts";
import { ImageBackendError } from "./errors/index.ts";

export interface SingleImageOptions {
  prompt: string;
  mascotPath?: string;
  outputDir: string;
  filename: string;
  seed: number;
  wide?: boolean;
  onProgress?: (msg: string) => void;
}

// Shared utilities used by backends

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

export async function padToWidescreen(mascotPath: string): Promise<string> {
  const mascot = sharp(mascotPath);
  const { width, height } = await mascot.metadata();
  if (!width || !height) throw ImageBackendError.unreadableMascot(mascotPath);

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

export function createImageBackend(model: ImageModel, runpodHttp?: HttpClient): ImageBackend {
  switch (model) {
    case "qwen": {
      if (!runpodHttp) throw new Error("runpodHttp is required for qwen backend");
      return createQwenBackend(runpodHttp);
    }
    default: throw ImageBackendError.unknownModel(model);
  }
}

// Orchestration

export async function generateSingleImage(
  options: SingleImageOptions,
  backend: ImageBackend,
): Promise<string> {
  const { prompt, mascotPath, outputDir, filename, seed, wide = false, onProgress } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  const log = onProgress ?? console.log;
  log(`Generating ${filename} ...`);

  const pngBuffer = await backend.generate({ prompt, mascotPath, seed, wide, onProgress });

  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, pngBuffer);
  log(`Saved ${filename} (${(pngBuffer.length / 1024).toFixed(0)} KB)`);

  return outputPath;
}
