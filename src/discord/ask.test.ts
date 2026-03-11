import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// File-level mock: swap implementation per test via shared variable
let generateContentImpl: (opts: Record<string, unknown>) => Promise<unknown>;

// @ts-expect-error — mock.module requires --experimental-test-module-mocks
mock.module("@google/genai", {
  namedExports: {
    GoogleGenAI: class {
      models = { generateContent: (opts: Record<string, unknown>) => generateContentImpl(opts) };
    },
  },
});

const { createAskService } = await import("./ask.ts");

describe("createAskService", () => {
  it("returns an answer from gemini", async () => {
    let capturedOpts: Record<string, unknown> | undefined;
    generateContentImpl = async (opts) => {
      capturedOpts = opts;
      return { text: "Use /generate with a post ID to create thumbnails." };
    };

    const service = createAskService();
    const answer = await service.answer("How do I generate images?");

    assert.ok(answer.includes("/generate"));
    assert.ok(capturedOpts);

    // Verify system instruction was passed
    const cfg = capturedOpts.config as Record<string, unknown>;
    assert.ok(typeof cfg.systemInstruction === "string");
    assert.ok((cfg.systemInstruction as string).includes("Kanario"));
  });

  it("truncates long responses", async () => {
    const longText = "x".repeat(2000);
    generateContentImpl = async () => ({ text: longText });

    const service = createAskService();
    const answer = await service.answer("test");

    assert.ok(answer.length <= 1800);
    assert.ok(answer.endsWith("..."));
  });
});
