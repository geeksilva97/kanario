import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

// File-level mock: swap implementation per test via shared variable
let generateContentImpl: Function;

// @ts-expect-error — mock.module requires --experimental-test-module-mocks
mock.module("@google/genai", {
  namedExports: {
    GoogleGenAI: class {
      models = { generateContent: (...args: any[]) => generateContentImpl(...args) };
    },
  },
});

const { createNanoBananaBackend } = await import("./nano-banana-backend.ts");

describe("NanoBananaBackend", () => {
  let tmpDir: string;
  let mascotPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-nb-test-"));
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
    const fakeImageBase64 = Buffer.from("fake-png-image").toString("base64");
    const spy = t.mock.fn(async () => ({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: fakeImageBase64, mimeType: "image/png" } }],
          role: "model",
        },
      }],
    }));
    generateContentImpl = spy;

    const backend = createNanoBananaBackend();
    const result = await backend.generate({
      prompt: "test prompt",
      mascotPath,
      seed: -1,
      wide: true,
    });

    assert.ok(Buffer.isBuffer(result));
    assert.deepEqual(result, Buffer.from(fakeImageBase64, "base64"));
    assert.equal(spy.mock.callCount(), 1);

    // Validate the request includes mascot and prompt
    const call = (spy.mock.calls[0] as any).arguments[0];
    assert.equal(call.model, "gemini-2.5-flash-image");
    const parts = call.contents[0].parts;
    assert.equal(parts.length, 2);
    assert.ok(parts[0].inlineData, "first part should be mascot image");
    assert.equal(parts[1].text, "test prompt");
  });

  it("generates image without mascot (text-only)", async (t) => {
    t.mock.method(console, "log", () => {});
    const fakeImageBase64 = Buffer.from("no-mascot-image").toString("base64");
    const spy = t.mock.fn(async () => ({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: fakeImageBase64, mimeType: "image/png" } }],
          role: "model",
        },
      }],
    }));
    generateContentImpl = spy;

    const backend = createNanoBananaBackend();
    const result = await backend.generate({
      prompt: "scene only prompt",
      seed: -1,
      wide: false,
    });

    assert.ok(Buffer.isBuffer(result));
    assert.equal(spy.mock.callCount(), 1);

    const call = (spy.mock.calls[0] as any).arguments[0];
    const parts = call.contents[0].parts;
    assert.equal(parts.length, 1);
    assert.equal(parts[0].text, "scene only prompt");
  });

  it("throws when response has no image data", async (t) => {
    t.mock.method(console, "log", () => {});
    generateContentImpl = async () => ({
      candidates: [{
        content: {
          parts: [{ text: "I cannot generate images" }],
          role: "model",
        },
      }],
    });

    const backend = createNanoBananaBackend();
    await assert.rejects(
      () => backend.generate({ prompt: "fail", seed: -1, wide: false }),
      { message: /Nano Banana returned no image data/ },
    );
  });

});
