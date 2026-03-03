import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { nextPromptNumber, improveWorkflow } from "./improve.ts";
import { FileError, ConfigError } from "../errors/index.ts";

describe("nextPromptNumber", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns 1 when directory does not exist", () => {
    assert.equal(nextPromptNumber("/nonexistent/dir"), 1);
  });

  it("returns 1 when directory is empty", () => {
    assert.equal(nextPromptNumber(tmpDir), 1);
  });

  it("returns next number after existing files", () => {
    fs.writeFileSync(path.join(tmpDir, "prompt-1.png"), "");
    fs.writeFileSync(path.join(tmpDir, "prompt-2.png"), "");
    fs.writeFileSync(path.join(tmpDir, "prompt-5.png"), "");
    fs.writeFileSync(path.join(tmpDir, "prompts.json"), "{}");
    assert.equal(nextPromptNumber(tmpDir), 6);
  });

  it("ignores non-matching files", () => {
    fs.writeFileSync(path.join(tmpDir, "prompt-3.png"), "");
    fs.writeFileSync(path.join(tmpDir, "prompt-2a.png"), "");
    fs.writeFileSync(path.join(tmpDir, "other.png"), "");
    assert.equal(nextPromptNumber(tmpDir), 4);
  });
});

describe("improveWorkflow", () => {
  let tmpDir: string;
  let tmpImage: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-improve-test-"));
    tmpImage = path.join(tmpDir, "test.png");
    fs.writeFileSync(tmpImage, "fake");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("throws FileError when source image does not exist", async () => {
    await assert.rejects(
      () => improveWorkflow({
        sourceImagePath: "/nonexistent/image.png",
        prompt: "make it better",
        outputDir: "/tmp",
      }),
      (err: unknown) => {
        if (!FileError.is(err)) return assert.fail("Expected FileError");
        assert.equal(err.type, "image_not_found");
        assert.match(err.message, /Image not found: \/nonexistent\/image\.png/);
        return true;
      },
    );
  });

  it("throws ConfigError when RUNPOD_API_KEY is missing for qwen", async () => {
    await assert.rejects(
      () => improveWorkflow({
        sourceImagePath: tmpImage,
        prompt: "make it better",
        imageModel: "qwen",
        outputDir: tmpDir,
      }),
      (err: unknown) => {
        if (!ConfigError.is(err)) return assert.fail("Expected ConfigError");
        assert.equal(err.type, "missing_env_vars");
        assert.match(err.message, /RUNPOD_API_KEY/);
        return true;
      },
    );
  });

});

