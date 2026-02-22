import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import { generateSingleImage, createImageBackend } from "../image-generator.ts";
import type { ImageModel } from "../image-backend.ts";

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
    throw new Error(`Image not found: ${sourceImagePath}`);
  }

  // Validate required env vars
  const missing: string[] = [];
  if (imageModel === "qwen" && !config.runpodApiKey) missing.push("RUNPOD_API_KEY");
  if (imageModel === "nano-banana" && !config.geminiApiKey) missing.push("GEMINI_API_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  const backend = createImageBackend(imageModel);

  // Find next available prompt number
  const startNumber = nextPromptNumber(outputDir);
  log(`[1/2] Generating 2 improved variants from ${path.basename(sourceImagePath)} ...`);
  log(`  Prompt: "${prompt}"`);
  log(`  Starting from prompt-${startNumber}.png`);

  // Generate 2 variants
  const jobs = [0, 1].map((i) => ({
    prompt,
    mascotPath: sourceImagePath,
    outputDir,
    filename: `prompt-${startNumber + i}.png`,
    seed: -1,
    wide: false,
  }));

  const concurrency = backend.maxConcurrency ?? jobs.length;
  const imagePaths: string[] = [];
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((job) => generateSingleImage(job, backend)),
    );
    imagePaths.push(...results);
  }

  log(`[2/2] Done! Generated ${imagePaths.length} images.`);

  return { imagePaths, outputDir };
}
