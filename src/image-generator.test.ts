import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { createImageBackend, padToWidescreen, encodeMascot, generateSingleImage, generateImages } from "./image-generator.ts";
import { createQwenBackend } from "./qwen-backend.ts";
import { createNanoBananaBackend } from "./nano-banana-backend.ts";
import type { ImageBackend } from "./image-backend.ts";

describe("ImageBackend", () => {
  it("createQwenBackend returns an object with generate method", () => {
    const backend = createQwenBackend();
    assert.equal(typeof backend.generate, "function");
  });

  it("createNanoBananaBackend returns an object with generate method", () => {
    const backend = createNanoBananaBackend();
    assert.equal(typeof backend.generate, "function");
  });

  it('createImageBackend("qwen") returns a backend', () => {
    const backend = createImageBackend("qwen");
    assert.equal(typeof backend.generate, "function");
  });

  it('createImageBackend("nano-banana") returns a backend', () => {
    const backend = createImageBackend("nano-banana");
    assert.equal(typeof backend.generate, "function");
  });

  it("createImageBackend throws on invalid model", () => {
    assert.throws(
      () => createImageBackend("invalid" as any),
      { message: /Unknown image model "invalid"/ },
    );
  });
});

describe("padToWidescreen", () => {
  let tmpDir: string;

  it("returns base64 of a 1280x720 image", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-pad-"));
    const mascotPath = path.join(tmpDir, "mascot.png");
    await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
      .png().toFile(mascotPath);

    const base64 = await padToWidescreen(mascotPath);
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    assert.equal(meta.width, 1280);
    assert.equal(meta.height, 720);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("scales a tall mascot to fit canvas height", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-pad-"));
    const mascotPath = path.join(tmpDir, "tall.png");
    await sharp({ create: { width: 100, height: 1000, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } })
      .png().toFile(mascotPath);

    const base64 = await padToWidescreen(mascotPath);
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    assert.equal(meta.width, 1280);
    assert.equal(meta.height, 720);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("scales a wide mascot to fit 1/3 canvas width", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-pad-"));
    const mascotPath = path.join(tmpDir, "wide.png");
    await sharp({ create: { width: 800, height: 200, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } })
      .png().toFile(mascotPath);

    const base64 = await padToWidescreen(mascotPath);
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    assert.equal(meta.width, 1280);
    assert.equal(meta.height, 720);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("encodeMascot", () => {
  it("returns widescreen base64 when wide is true", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-enc-"));
    const mascotPath = path.join(tmpDir, "mascot.png");
    await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
      .png().toFile(mascotPath);

    const base64 = await encodeMascot(mascotPath, true);
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    assert.equal(meta.width, 1280);
    assert.equal(meta.height, 720);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns raw file base64 when wide is false", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-enc-"));
    const mascotPath = path.join(tmpDir, "mascot.png");
    await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
      .png().toFile(mascotPath);

    const base64 = await encodeMascot(mascotPath, false);
    const expected = fs.readFileSync(mascotPath).toString("base64");
    assert.equal(base64, expected);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

function fakeBackend(buf?: Buffer): ImageBackend {
  return {
    generate: async () => buf ?? Buffer.from("fake-png"),
  };
}

describe("generateSingleImage", () => {
  it("calls backend and writes file to outputDir", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-gen-"));
    try {
      const content = Buffer.from("fake-png-data");
      const outputPath = await generateSingleImage({
        prompt: "test prompt",
        outputDir: tmpDir,
        filename: "prompt-1.png",
        seed: 42,
      }, fakeBackend(content));

      assert.equal(outputPath, path.join(tmpDir, "prompt-1.png"));
      assert.deepEqual(fs.readFileSync(outputPath), content);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("creates outputDir if it does not exist", async () => {
    const tmpDir = path.join(os.tmpdir(), `kanario-gen-${Date.now()}`);
    try {
      await generateSingleImage({
        prompt: "test",
        outputDir: tmpDir,
        filename: "img.png",
        seed: -1,
      }, fakeBackend());

      assert.ok(fs.existsSync(path.join(tmpDir, "img.png")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

describe("generateImages", () => {
  it("generates two images with a/b suffixes", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-gen-"));
    try {
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
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
