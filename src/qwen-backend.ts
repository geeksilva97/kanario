import sharp from "sharp";
import { config } from "./config.ts";
import { createHttpClient, type HttpClient } from "./http.ts";
import { encodeMascot } from "./image-generator.ts";
import type { ImageBackend } from "./image-backend.ts";
import { HttpError, ImageBackendError } from "./errors/index.ts";

const POLL_INTERVALS_MS = [1_000, 2_000]; // ramp up, then 3s steady
const POLL_STEADY_MS = 3_000;
const MAX_POLL_ATTEMPTS = 100; // ~5 minutes

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
    timeout: 30_000,
  });
}

function wrapRunPodError<T>(
  promise: Promise<T>,
  transform: (err: HttpError) => ImageBackendError,
): Promise<T> {
  return promise.catch((err: unknown) => {
    if (HttpError.is(err)) throw transform(err);
    throw err;
  });
}

async function pollUntilCompleted(http: HttpClient, jobId: string): Promise<RunPodStatus> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const res = await wrapRunPodError(
      http.request(`/status/${jobId}`),
      (err) => ImageBackendError.runpodApiError(err.meta.status, err.meta.body),
    );
    // res.json() returns unknown — no runtime validation for RunPod API responses
    const status = (await res.json()) as RunPodStatus;

    if (status.status === "COMPLETED") {
      return status;
    }

    if (status.status === "FAILED") {
      throw ImageBackendError.runpodJobFailed(jobId, status);
    }

    const delay = POLL_INTERVALS_MS[attempt] ?? POLL_STEADY_MS;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw ImageBackendError.runpodPollingTimeout(jobId, MAX_POLL_ATTEMPTS);
}

const blankCanvasCache = new Map<string, string>();

async function getBlankCanvas(wide: boolean): Promise<string> {
  const key = wide ? "wide" : "square";
  const cached = blankCanvasCache.get(key);
  if (cached) return cached;

  const w = wide ? 1280 : 1024;
  const h = wide ? 720 : 1024;
  const blank = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();
  const result = blank.toString("base64");
  blankCanvasCache.set(key, result);
  return result;
}

export function createQwenBackend(http: HttpClient): ImageBackend {
  return {
    async generate({ prompt, mascotPath, seed, wide, onProgress }) {
      const log = onProgress ?? (() => {});

      const mascotBase64 = mascotPath
        ? await encodeMascot(mascotPath, wide)
        : await getBlankCanvas(wide);

      const body = {
        input: {
          prompt,
          image: `data:image/png;base64,${mascotBase64}`,
          seed,
          output_format: "png",
        },
      };

      log("Submitting job to RunPod Hub ...");
      const submitRes = await wrapRunPodError(
        http.request("/run", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        (err) => ImageBackendError.runpodApiError(err.meta.status, err.meta.body),
      );
      const { id: jobId } = await submitRes.json();

      log(`Job ${jobId} queued, polling for result ...`);
      const result = await pollUntilCompleted(http, jobId);

      const imageUrl = result.output!.result;
      log("Downloading result image ...");
      const imageRes = await wrapRunPodError(
        http.request(imageUrl),
        (err) => ImageBackendError.downloadFailed(err.meta.status),
      );
      return Buffer.from(await imageRes.arrayBuffer());
    },
  };
}
