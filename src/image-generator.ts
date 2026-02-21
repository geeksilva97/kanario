import fs from "node:fs";
import path from "node:path";
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

async function generateSingle(
  prompt: string,
  mascotPath: string,
  seed: number,
): Promise<Buffer> {
  const mascotBase64 = fs.readFileSync(mascotPath).toString("base64");

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
