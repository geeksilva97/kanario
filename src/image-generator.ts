import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.ts";

const RUNPOD_BASE = "https://api.runpod.ai/v2/qwen-image-edit";
const POLL_INTERVAL_MS = 3_000;

export interface GenerateImageOptions {
  prompt: string;
  mascotPath: string;
  outputDir: string;
  filenamePrefix: string;
}

export interface SingleImageOptions {
  prompt: string;
  mascotPath: string;
  outputDir: string;
  filename: string;
  seed: number;
}

async function runpodRequest(endpoint: string, init?: RequestInit) {
  const res = await fetch(`${RUNPOD_BASE}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.runpodApiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunPod API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function pollUntilCompleted(jobId: string): Promise<any> {
  while (true) {
    const status = await runpodRequest(`/status/${jobId}`);

    if (status.status === "COMPLETED") {
      return status;
    }

    if (status.status === "FAILED") {
      throw new Error(`RunPod job ${jobId} failed: ${JSON.stringify(status)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

async function padToWidescreen(mascotPath: string): Promise<string> {
  const mascot = sharp(mascotPath);
  const { width, height } = await mascot.metadata();
  if (!width || !height) throw new Error(`Cannot read dimensions of ${mascotPath}`);

  const scale = Math.min(CANVAS_HEIGHT / height, CANVAS_WIDTH / 2 / width);
  const resized = await mascot.resize(Math.round(width * scale), Math.round(height * scale)).toBuffer();

  const padded = await sharp({
    create: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();

  return padded.toString("base64");
}

async function generateSingle(
  prompt: string,
  mascotPath: string,
  seed: number,
): Promise<Buffer> {
  const mascotBase64 = await padToWidescreen(mascotPath);

  const body = {
    input: {
      prompt,
      image: `data:image/png;base64,${mascotBase64}`,
      seed,
      output_format: "png",
    },
  };

  console.log(`    Submitting job to RunPod Hub ...`);
  const { id: jobId } = await runpodRequest("/run", {
    method: "POST",
    body: JSON.stringify(body),
  });

  console.log(`    Job ${jobId} queued, polling for result ...`);
  const result = await pollUntilCompleted(jobId);

  const imageUrl = result.output.result;
  console.log(`    Downloading result image ...`);
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to download image: ${imageRes.status}`);
  }
  return Buffer.from(await imageRes.arrayBuffer());
}

export async function generateSingleImage(
  options: SingleImageOptions,
): Promise<string> {
  const { prompt, mascotPath, outputDir, filename, seed } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`  Generating ${filename} (seed: ${seed}) ...`);

  const pngBuffer = await generateSingle(prompt, mascotPath, seed);

  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`  Saved ${filename} (${(pngBuffer.length / 1024).toFixed(0)} KB)`);

  return outputPath;
}

export async function generateImages(
  options: GenerateImageOptions,
): Promise<string[]> {
  const { prompt, mascotPath, outputDir, filenamePrefix } = options;

  const seeds = [
    Math.floor(Math.random() * 2 ** 32),
    Math.floor(Math.random() * 2 ** 32),
  ];

  const suffixes = ["a", "b"];

  const paths = await Promise.all(
    suffixes.map((suffix, i) =>
      generateSingleImage({
        prompt,
        mascotPath,
        outputDir,
        filename: `${filenamePrefix}${suffix}.png`,
        seed: seeds[i],
      }),
    ),
  );

  return paths;
}
