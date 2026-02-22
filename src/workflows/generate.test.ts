import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateWorkflow } from "./generate.ts";
import type { WPCredentials } from "../credentials.ts";

const fakeCreds: WPCredentials = {
  wpUrl: "https://blog.codeminer42.com",
  wpUsername: "testuser",
  wpAppPassword: "xxxx xxxx xxxx",
};

describe("generateWorkflow", () => {
  it("throws on invalid model", async () => {
    await assert.rejects(
      () => generateWorkflow({ creds: fakeCreds, postId: "123", model: "gpt4" as any, wide: true }),
      { message: /Unknown model "gpt4"/ },
    );
  });

  it("throws when RUNPOD_API_KEY is missing for qwen", async () => {
    await assert.rejects(
      () => generateWorkflow({ creds: fakeCreds, postId: "123", model: "gemini", imageModel: "qwen", wide: true }),
      { message: /RUNPOD_API_KEY/ },
    );
  });

  it("throws when GEMINI_API_KEY is missing for gemini model", async () => {
    await assert.rejects(
      () => generateWorkflow({ creds: fakeCreds, postId: "123", model: "gemini", imageModel: "qwen", wide: true }),
      { message: /GEMINI_API_KEY/ },
    );
  });

  it("throws when ANTHROPIC_API_KEY is missing for claude model", async () => {
    await assert.rejects(
      () => generateWorkflow({ creds: fakeCreds, postId: "123", model: "claude", imageModel: "qwen", wide: true }),
      { message: /ANTHROPIC_API_KEY/ },
    );
  });

  it("throws when GEMINI_API_KEY is missing for nano-banana", async () => {
    await assert.rejects(
      () => generateWorkflow({ creds: fakeCreds, postId: "123", model: "claude", imageModel: "nano-banana", wide: true }),
      { message: /GEMINI_API_KEY/ },
    );
  });
});
