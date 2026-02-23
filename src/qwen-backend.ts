import sharp from "sharp";
import { config } from "./config.ts";
import { encodeMascot } from "./image-generator.ts";
import type { ImageBackend } from "./image-backend.ts";
import { ImageBackendError } from "./errors.ts";

const RUNPOD_BASE = "https://api.runpod.ai/v2/qwen-image-edit";
const POLL_INTERVAL_MS = 3_000;

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
    throw ImageBackendError.runpodApiError(res.status, text);
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
      throw ImageBackendError.runpodJobFailed(jobId, status);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export function createQwenBackend(): ImageBackend {
  return {
    async generate({ prompt, mascotPath, seed, wide }) {
      let mascotBase64: string;
      if (mascotPath) {
        mascotBase64 = await encodeMascot(mascotPath, wide);
      } else {
        const w = wide ? 1280 : 1024;
        const h = wide ? 720 : 1024;
        const blank = await sharp({
          create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
        }).png().toBuffer();
        mascotBase64 = blank.toString("base64");
      }

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
        throw ImageBackendError.downloadFailed(imageRes.status);
      }
      return Buffer.from(await imageRes.arrayBuffer());
    },
  };
}
