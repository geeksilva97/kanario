import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { createImageBackend, padToWidescreen, encodeMascot, generateSingleImage, generateImages } from "./image-generator.ts";
import { createQwenBackend } from "./qwen-backend.ts";
import type { HttpClient } from "./http.ts";
import type { ImageBackend } from "./image-backend.ts";
import { ImageBackendError } from "./errors.ts";

const fakeRunpodHttp: HttpClient = {
  baseUrl: "https://api.runpod.ai/v2/qwen-image-edit",
  request: async () => new Response("{}"),
};

describe("ImageBackend", () => {
  it("createQwenBackend returns an object with generate method", () => {
    const backend = createQwenBackend(fakeRunpodHttp);
    assert.equal(typeof backend.generate, "function");
  });

  it('createImageBackend("qwen") returns a backend', () => {
    const backend = createImageBackend("qwen", fakeRunpodHttp);
    assert.equal(typeof backend.generate, "function");
  });

  it("createImageBackend throws ImageBackendError on invalid model", () => {
    assert.throws(
      // @ts-expect-error — intentionally passing invalid model to test error handling
      () => createImageBackend("invalid"),
      (err: unknown) => {
        if (!ImageBackendError.is(err)) return assert.fail("Expected ImageBackendError");
        assert.equal(err.type, "unknown_image_model");
        assert.match(err.message, /Unknown image model "invalid"/);
        return true;
      },
    );
  });

  it("createImageBackend throws when qwen is missing runpodHttp", () => {
    assert.throws(
      () => createImageBackend("qwen"),
      (err: unknown) => {
        if (!(err instanceof Error)) return assert.fail("Expected Error");
        assert.match(err.message, /runpodHttp is required/);
        return true;
      },
    );
  });
});

describe("padToWidescreen", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-pad-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns base64 of a 1280x720 image", async () => {
    const mascotPath = path.join(tmpDir, "mascot.png");
    await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
      .png().toFile(mascotPath);

    const base64 = await padToWidescreen(mascotPath);
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    assert.equal(meta.width, 1280);
    assert.equal(meta.height, 720);
  });

  it("scales a tall mascot to fit canvas height", async () => {
    const mascotPath = path.join(tmpDir, "tall.png");
    await sharp({ create: { width: 100, height: 1000, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } })
      .png().toFile(mascotPath);

    const base64 = await padToWidescreen(mascotPath);
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    assert.equal(meta.width, 1280);
    assert.equal(meta.height, 720);
  });

  it("scales a wide mascot to fit 1/3 canvas width", async () => {
    const mascotPath = path.join(tmpDir, "wide.png");
    await sharp({ create: { width: 800, height: 200, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } })
      .png().toFile(mascotPath);

    const base64 = await padToWidescreen(mascotPath);
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    assert.equal(meta.width, 1280);
    assert.equal(meta.height, 720);
  });
});

describe("encodeMascot", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-enc-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns widescreen base64 when wide is true", async () => {
    const mascotPath = path.join(tmpDir, "mascot.png");
    await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
      .png().toFile(mascotPath);

    const base64 = await encodeMascot(mascotPath, true);
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    assert.equal(meta.width, 1280);
    assert.equal(meta.height, 720);
  });

  it("returns raw file base64 when wide is false", async () => {
    const mascotPath = path.join(tmpDir, "mascot.png");
    await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
      .png().toFile(mascotPath);

    const base64 = await encodeMascot(mascotPath, false);
    const expected = fs.readFileSync(mascotPath).toString("base64");
    assert.equal(base64, expected);
  });
});

function fakeBackend(buf?: Buffer): ImageBackend {
  return {
    generate: async () => buf ?? Buffer.from("fake-png"),
  };
}

describe("generateSingleImage", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-gen-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("calls backend and writes file to outputDir", async () => {
    const content = Buffer.from("fake-png-data");
    const outputPath = await generateSingleImage({
      prompt: "test prompt",
      outputDir: tmpDir,
      filename: "prompt-1.png",
      seed: 42,
    }, fakeBackend(content));

    assert.equal(outputPath, path.join(tmpDir, "prompt-1.png"));
    assert.deepEqual(fs.readFileSync(outputPath), content);
  });

  it("creates outputDir if it does not exist", async () => {
    const nested = path.join(tmpDir, "nested");
    await generateSingleImage({
      prompt: "test",
      outputDir: nested,
      filename: "img.png",
      seed: -1,
    }, fakeBackend());

    assert.ok(fs.existsSync(path.join(nested, "img.png")));
  });
});

describe("generateImages", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-gen-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("generates two images with a/b suffixes", async () => {
    const paths = await generateImages({
      prompt: "test",
      outputDir: tmpDir,
      filenamePrefix: "prompt-1",
    }, fakeBackend());

    assert.equal(paths.length, 2);
    assert.equal(path.basename(paths[0]), "prompt-1a.png");
    assert.equal(path.basename(paths[1]), "prompt-1b.png");
    assert.ok(fs.existsSync(paths[0]));
    assert.ok(fs.existsSync(paths[1]));
  });
});
