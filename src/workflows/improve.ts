import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import { generateSingleImage, createImageBackend } from "../image-generator.ts";
import { createRunpodClient } from "../qwen-backend.ts";
import type { ImageModel } from "../image-backend.ts";
import { FileError, ConfigError } from "../errors.ts";

export interface ImproveOptions {
  sourceImagePath: string;
  prompt: string;
  imageModel?: ImageModel;
  outputDir: string;
}

export interface ImproveResult {
  imagePaths: string[];
  outputDir: string;
}

export function nextPromptNumber(outputDir: string): number {
  if (!fs.existsSync(outputDir)) return 1;

  const files = fs.readdirSync(outputDir);
  let max = 0;
  for (const file of files) {
    const match = file.match(/^prompt-(\d+)\.png$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

export async function improveWorkflow(
  options: ImproveOptions,
  onProgress?: (msg: string) => void,
): Promise<ImproveResult> {
  const { sourceImagePath, prompt, imageModel = "qwen", outputDir } = options;
  const log = onProgress ?? (() => {});

  // Validate source image exists
  if (!fs.existsSync(sourceImagePath)) {
    throw FileError.imageNotFound(sourceImagePath);
  }

  // Validate required env vars
  const missing: string[] = [];
  if (imageModel === "qwen" && !config.runpodApiKey) missing.push("RUNPOD_API_KEY");
  if (missing.length > 0) {
    throw ConfigError.missingEnvVars(missing);
  }

  const runpodHttp = createRunpodClient();
  const backend = createImageBackend(imageModel, runpodHttp);

  // Find next available prompt number
  const startNumber = nextPromptNumber(outputDir);
  log(`Generating improved image from ${path.basename(sourceImagePath)} ...`);
  log(`  Prompt: "${prompt}"`);
  log(`  Output: prompt-${startNumber}.png`);

  const job = {
    prompt,
    mascotPath: sourceImagePath,
    outputDir,
    filename: `prompt-${startNumber}.png`,
    seed: -1,
    wide: false,
  };

  const imagePath = await generateSingleImage(job, backend);

  log(`Done! Generated prompt-${startNumber}.png`);

  return { imagePaths: [imagePath], outputDir };
}
