import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { nextPromptNumber, improveWorkflow } from "./improve.ts";

describe("nextPromptNumber", () => {
  it("returns 1 when directory does not exist", () => {
    assert.equal(nextPromptNumber("/nonexistent/dir"), 1);
  });

  it("returns 1 when directory is empty", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-test-"));
    try {
      assert.equal(nextPromptNumber(dir), 1);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("returns next number after existing files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-test-"));
    try {
      fs.writeFileSync(path.join(dir, "prompt-1.png"), "");
      fs.writeFileSync(path.join(dir, "prompt-2.png"), "");
      fs.writeFileSync(path.join(dir, "prompt-5.png"), "");
      fs.writeFileSync(path.join(dir, "prompts.json"), "{}");
      assert.equal(nextPromptNumber(dir), 6);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("ignores non-matching files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-test-"));
    try {
      fs.writeFileSync(path.join(dir, "prompt-3.png"), "");
      fs.writeFileSync(path.join(dir, "prompt-2a.png"), "");
      fs.writeFileSync(path.join(dir, "other.png"), "");
      assert.equal(nextPromptNumber(dir), 4);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
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
