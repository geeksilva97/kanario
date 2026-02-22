import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { nextPromptNumber, improveWorkflow } from "./improve.ts";

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
  it("throws when source image does not exist", async () => {
    await assert.rejects(
      () => improveWorkflow({
        sourceImagePath: "/nonexistent/image.png",
        prompt: "make it better",
        outputDir: "/tmp",
      }),
      { message: /Image not found: \/nonexistent\/image\.png/ },
    );
  });
});
