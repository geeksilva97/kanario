import fs from "node:fs";
import path from "node:path";
import { config, MASCOT_URL } from "./config.ts";

const RUNPOD_BASE = "https://api.runpod.ai/v2/qwen-image-edit";
const POLL_INTERVAL_MS = 3_000;

export interface GenerateImageOptions {
  prompt: string;
  outputDir: string;
  filenamePrefix: string;
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
  seed: number,
): Promise<Buffer> {
  const body = {
    input: {
      prompt,
      image: MASCOT_URL,
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

  const base64 = result.output.output_image_base64;
  return Buffer.from(base64, "base64");
}

export async function generateImages(
  options: GenerateImageOptions,
): Promise<string[]> {
  const { prompt, outputDir, filenamePrefix } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  const seeds = [
    Math.floor(Math.random() * 2 ** 32),
    Math.floor(Math.random() * 2 ** 32),
  ];

  const suffixes = ["a", "b"];
  const savedPaths: string[] = [];

  for (let i = 0; i < 2; i++) {
    const filename = `${filenamePrefix}${suffixes[i]}.png`;
    const outputPath = path.join(outputDir, filename);

    console.log(`  Generating ${filename} (seed: ${seeds[i]}) ...`);

    const pngBuffer = await generateSingle(prompt, seeds[i]);

    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`  Saved ${filename} (${(pngBuffer.length / 1024).toFixed(0)} KB)`);

    savedPaths.push(outputPath);
  }

  return savedPaths;
}
