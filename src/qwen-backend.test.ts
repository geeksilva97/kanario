import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { createQwenBackend } from "./qwen-backend.ts";

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
    let submitBody: any;
    const mockFetch = t.mock.method(globalThis, "fetch", (url: string | URL) => {
      callNum++;
      if (callNum === 1) {
        assert.ok(String(url).endsWith("/run"));
        return Promise.resolve(new Response(JSON.stringify({ id: "job-1" })));
      }
      if (callNum === 2) {
        assert.ok(String(url).includes("/status/job-1"));
        return Promise.resolve(new Response(JSON.stringify({
          status: "COMPLETED",
          output: { result: "https://cdn.example.com/img.png" },
        })));
      }
      if (callNum === 3) {
        assert.equal(String(url), "https://cdn.example.com/img.png");
        return Promise.resolve(new Response(Buffer.from("fake-png-data")));
      }
      throw new Error(`Unexpected fetch call #${callNum}`);
    });

    const backend = createQwenBackend();
    const result = await backend.generate({
      prompt: "test prompt",
      mascotPath,
      seed: -1,
      wide: true,
    });

    assert.ok(Buffer.isBuffer(result));
    assert.equal(mockFetch.mock.callCount(), 3);

    // Validate the /run request body
    submitBody = JSON.parse((mockFetch.mock.calls[0].arguments[1] as any).body);
    assert.equal(submitBody.input.prompt, "test prompt");
    assert.equal(submitBody.input.seed, -1);
    assert.equal(submitBody.input.output_format, "png");
    assert.ok(submitBody.input.image.startsWith("data:image/png;base64,"));
  });

  it("generates image without mascot (blank canvas)", async (t) => {
    t.mock.method(console, "log", () => {});

    let callNum = 0;
    const mockFetch = t.mock.method(globalThis, "fetch", () => {
      callNum++;
      if (callNum === 1) {
        return Promise.resolve(new Response(JSON.stringify({ id: "job-2" })));
      }
      if (callNum === 2) {
        return Promise.resolve(new Response(JSON.stringify({
          status: "COMPLETED",
          output: { result: "https://cdn.example.com/img2.png" },
        })));
      }
      if (callNum === 3) {
        return Promise.resolve(new Response(Buffer.from("blank-result")));
      }
      throw new Error(`Unexpected fetch call #${callNum}`);
    });

    const backend = createQwenBackend();
    const result = await backend.generate({
      prompt: "scene only",
      seed: 42,
      wide: false,
    });

    assert.ok(Buffer.isBuffer(result));
    assert.equal(mockFetch.mock.callCount(), 3);

    // Blank canvas should still produce a base64 data URI
    const submitBody = JSON.parse((mockFetch.mock.calls[0].arguments[1] as any).body);
    assert.ok(submitBody.input.image.startsWith("data:image/png;base64,"));
    assert.equal(submitBody.input.seed, 42);
  });

  it("throws when job fails", async (t) => {
    t.mock.method(console, "log", () => {});

    let callNum = 0;
    t.mock.method(globalThis, "fetch", () => {
      callNum++;
      if (callNum === 1) {
        return Promise.resolve(new Response(JSON.stringify({ id: "job-fail" })));
      }
      if (callNum === 2) {
        return Promise.resolve(new Response(JSON.stringify({
          status: "FAILED",
          error: "GPU OOM",
        })));
      }
      throw new Error(`Unexpected fetch call #${callNum}`);
    });

    const backend = createQwenBackend();
    await assert.rejects(
      () => backend.generate({ prompt: "fail test", seed: -1, wide: false }),
      { message: /RunPod job job-fail failed/ },
    );
  });

  it("throws on API error during submit", async (t) => {
    t.mock.method(console, "log", () => {});

    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("server error", { status: 500 })),
    );

    const backend = createQwenBackend();
    await assert.rejects(
      () => backend.generate({ prompt: "error test", seed: -1, wide: false }),
      { message: /RunPod API error 500/ },
    );
  });

  it("throws when image download fails", async (t) => {
    t.mock.method(console, "log", () => {});

    let callNum = 0;
    t.mock.method(globalThis, "fetch", () => {
      callNum++;
      if (callNum === 1) {
        return Promise.resolve(new Response(JSON.stringify({ id: "job-dl" })));
      }
      if (callNum === 2) {
        return Promise.resolve(new Response(JSON.stringify({
          status: "COMPLETED",
          output: { result: "https://cdn.example.com/missing.png" },
        })));
      }
      if (callNum === 3) {
        return Promise.resolve(new Response("Not Found", { status: 404 }));
      }
      throw new Error(`Unexpected fetch call #${callNum}`);
    });

    const backend = createQwenBackend();
    await assert.rejects(
      () => backend.generate({ prompt: "download fail", seed: -1, wide: false }),
      { message: /Failed to download image: 404/ },
    );
  });
});
