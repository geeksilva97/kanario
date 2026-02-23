import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { createQwenBackend } from "./qwen-backend.ts";
import type { HttpClient } from "./http.ts";
import { HttpError, ImageBackendError } from "./errors.ts";

function mockRunpodClient(impl: (path: string, init?: RequestInit) => Promise<Response>): HttpClient {
  return {
    baseUrl: "https://api.runpod.ai/v2/qwen-image-edit",
    request: impl,
  };
}

describe("QwenBackend", () => {
  let tmpDir: string;
  let mascotPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-qwen-test-"));
    mascotPath = path.join(tmpDir, "mascot.png");
    const buf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();
    fs.writeFileSync(mascotPath, buf);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("generates image with mascot (happy path)", async (t) => {
    t.mock.method(console, "log", () => {});

    let callNum = 0;
    const http = mockRunpodClient(async (p) => {
      callNum++;
      if (callNum === 1) {
        assert.ok(p === "/run");
        return new Response(JSON.stringify({ id: "job-1" }));
      }
      if (callNum === 2) {
        assert.ok(p === "/status/job-1");
        return new Response(JSON.stringify({
          status: "COMPLETED",
          output: { result: "https://cdn.example.com/img.png" },
        }));
      }
      if (callNum === 3) {
        assert.equal(p, "https://cdn.example.com/img.png");
        return new Response(Buffer.from("fake-png-data"));
      }
      throw new Error(`Unexpected request call #${callNum}`);
    });

    const backend = createQwenBackend(http);
    const result = await backend.generate({
      prompt: "test prompt",
      mascotPath,
      seed: -1,
      wide: true,
    });

    assert.ok(Buffer.isBuffer(result));
    assert.equal(callNum, 3);
  });

  it("generates image without mascot (blank canvas)", async (t) => {
    t.mock.method(console, "log", () => {});

    let callNum = 0;
    let submitBody: any;
    const http = mockRunpodClient(async (p, init) => {
      callNum++;
      if (callNum === 1) {
        submitBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ id: "job-2" }));
      }
      if (callNum === 2) {
        return new Response(JSON.stringify({
          status: "COMPLETED",
          output: { result: "https://cdn.example.com/img2.png" },
        }));
      }
      if (callNum === 3) {
        return new Response(Buffer.from("blank-result"));
      }
      throw new Error(`Unexpected request call #${callNum}`);
    });

    const backend = createQwenBackend(http);
    const result = await backend.generate({
      prompt: "scene only",
      seed: 42,
      wide: false,
    });

    assert.ok(Buffer.isBuffer(result));
    assert.equal(callNum, 3);

    // Blank canvas should still produce a base64 data URI
    assert.ok(submitBody.input.image.startsWith("data:image/png;base64,"));
    assert.equal(submitBody.input.seed, 42);
  });

  it("throws ImageBackendError when job fails", async (t) => {
    t.mock.method(console, "log", () => {});

    let callNum = 0;
    const http = mockRunpodClient(async () => {
      callNum++;
      if (callNum === 1) {
        return new Response(JSON.stringify({ id: "job-fail" }));
      }
      if (callNum === 2) {
        return new Response(JSON.stringify({
          status: "FAILED",
          error: "GPU OOM",
        }));
      }
      throw new Error(`Unexpected request call #${callNum}`);
    });

    const backend = createQwenBackend(http);
    await assert.rejects(
      () => backend.generate({ prompt: "fail test", seed: -1, wide: false }),
      (err: any) => {
        assert.ok(ImageBackendError.is(err));
        assert.equal(err.type, "runpod_job_failed");
        assert.match(err.message, /RunPod job job-fail failed/);
        assert.equal(err.meta.jobId, "job-fail");
        return true;
      },
    );
  });

  it("throws ImageBackendError on API error during submit", async (t) => {
    t.mock.method(console, "log", () => {});

    const http = mockRunpodClient(async (p, init) => {
      throw new HttpError(init?.method ?? "GET", `https://api.runpod.ai/v2/qwen-image-edit${p}`, 500, "Internal Server Error", "server error");
    });

    const backend = createQwenBackend(http);
    await assert.rejects(
      () => backend.generate({ prompt: "error test", seed: -1, wide: false }),
      (err: any) => {
        assert.ok(ImageBackendError.is(err));
        assert.equal(err.type, "runpod_api_error");
        assert.equal(err.meta.status, 500);
        return true;
      },
    );
  });

  it("throws ImageBackendError when image download fails", async (t) => {
    t.mock.method(console, "log", () => {});

    let callNum = 0;
    const http = mockRunpodClient(async (p, init) => {
      callNum++;
      if (callNum === 1) {
        return new Response(JSON.stringify({ id: "job-dl" }));
      }
      if (callNum === 2) {
        return new Response(JSON.stringify({
          status: "COMPLETED",
          output: { result: "https://cdn.example.com/missing.png" },
        }));
      }
      if (callNum === 3) {
        throw new HttpError("GET", "https://cdn.example.com/missing.png", 404, "Not Found", "Not Found");
      }
      throw new Error(`Unexpected request call #${callNum}`);
    });

    const backend = createQwenBackend(http);
    await assert.rejects(
      () => backend.generate({ prompt: "download fail", seed: -1, wide: false }),
      (err: any) => {
        assert.ok(ImageBackendError.is(err));
        assert.equal(err.type, "download_failed");
        assert.equal(err.meta.status, 404);
        return true;
      },
    );
  });
});
