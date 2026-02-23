import sharp from "sharp";
import { config } from "./config.ts";
import { createHttpClient, type HttpClient } from "./http.ts";
import { encodeMascot } from "./image-generator.ts";
import type { ImageBackend } from "./image-backend.ts";
import { HttpError, ImageBackendError } from "./errors.ts";

const POLL_INTERVAL_MS = 3_000;

interface RunPodStatus {
  status: "COMPLETED" | "FAILED" | "IN_QUEUE" | "IN_PROGRESS";
  output?: { result: string };
}

export function createRunpodClient(): HttpClient {
  return createHttpClient({
    baseUrl: "https://api.runpod.ai/v2/qwen-image-edit",
    headers: {
      Authorization: `Bearer ${config.runpodApiKey}`,
      "Content-Type": "application/json",
    },
  });
}

async function pollUntilCompleted(http: HttpClient, jobId: string): Promise<RunPodStatus> {
  while (true) {
    let res: Response;
    try {
      res = await http.request(`/status/${jobId}`);
    } catch (err) {
      if (HttpError.is(err)) {
        throw ImageBackendError.runpodApiError(err.meta.status, err.meta.body);
      }
      throw err;
    }
    // res.json() returns unknown — no runtime validation for RunPod API responses
    const status = (await res.json()) as RunPodStatus;

    if (status.status === "COMPLETED") {
      return status;
    }

    if (status.status === "FAILED") {
      throw ImageBackendError.runpodJobFailed(jobId, status);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export function createQwenBackend(http: HttpClient): ImageBackend {
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
      let submitRes: Response;
      try {
        submitRes = await http.request("/run", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } catch (err) {
        if (HttpError.is(err)) {
          throw ImageBackendError.runpodApiError(err.meta.status, err.meta.body);
        }
        throw err;
      }
      const { id: jobId } = await submitRes.json();

      console.log(`    Job ${jobId} queued, polling for result ...`);
      const result = await pollUntilCompleted(http, jobId);

      const imageUrl = result.output!.result;
      console.log(`    Downloading result image ...`);
      let imageRes: Response;
      try {
        imageRes = await http.request(imageUrl);
      } catch (err) {
        if (HttpError.is(err)) {
          throw ImageBackendError.downloadFailed(err.meta.status);
        }
        throw err;
      }
      return Buffer.from(await imageRes.arrayBuffer());
    },
  };
}
