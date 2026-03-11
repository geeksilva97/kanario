import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, OUTPUT_DIR, RESTYLE_TEMPLATE, BACKGROUND_COLORS } from "../config.ts";
import { generateSingleImage, createImageBackend } from "../image-generator.ts";
import { createRunpodClient } from "../qwen-backend.ts";
import type { ImageModel } from "../image-backend.ts";
import { FileError, ConfigError } from "../errors/index.ts";
import { isBackgroundId } from "../utils/type-guards.ts";

export interface RestyleOptions {
  sourceImagePath: string;
  imageModel?: ImageModel;
  outputDir?: string;
  wide: boolean;
  hint?: string;
  background?: string;
}

export interface RestyleResult {
  id: string;
  imagePath: string;
  outputDir: string;
}

function buildRestylePrompt(hint: string | undefined, backgroundId: string): string {
  const bg = (isBackgroundId(backgroundId) ? BACKGROUND_COLORS[backgroundId] : BACKGROUND_COLORS.white).prompt;
  const base = RESTYLE_TEMPLATE.replace("[BACKGROUND]", bg);
  if (hint) {
    return base + ` Emphasize: ${hint}.`;
  }
  return base;
}

export async function restyleWorkflow(
  options: RestyleOptions,
  onProgress?: (msg: string) => void,
): Promise<RestyleResult> {
  const {
    sourceImagePath,
    imageModel = "qwen",
    outputDir: customOutputDir,
    wide,
    hint,
    background = "white",
  } = options;
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

  // Step 1: Build restyle prompt
  log(`[1/2] Building restyle prompt (background: ${background}) ...`);
  const fullPrompt = buildRestylePrompt(hint, background);
  log(`  Prompt: ${fullPrompt.slice(0, 120)}...`);

  // Step 2: Generate restyled image
  log(`[2/2] Generating restyled image via Qwen ...`);
  const id = crypto.randomUUID().slice(0, 8);
  const outputDir = customOutputDir ? path.resolve(customOutputDir) : path.join(OUTPUT_DIR, id);

  const imagePath = await generateSingleImage(
    {
      prompt: fullPrompt,
      mascotPath: sourceImagePath,
      outputDir,
      filename: "prompt-1.png",
      seed: -1,
      wide,
      onProgress: log,
    },
    backend,
  );

  return { id, imagePath, outputDir };
}
