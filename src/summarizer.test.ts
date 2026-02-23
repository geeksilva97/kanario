import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { config } from "./config.ts";

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

const { summarizePost } = await import("./summarizer.ts");

describe("summarizePost", () => {
  const fakePost = {
    title: "Understanding Dependency Injection in Ruby",
    content: "Dependency injection is a design pattern...",
    excerpt: "A guide to DI in Ruby.",
  };

  it("returns a summary string via gemini", async (t) => {
    const spy = t.mock.fn(async () => ({
      text: "Core thesis: DI decouples components.\n- Benefit 1\n- Benefit 2",
    }));
    generateContentImpl = spy;

    const summary = await summarizePost(fakePost, "gemini");
    assert.equal(typeof summary, "string");
    assert.ok(summary.length > 0);
    assert.ok(summary.includes("DI decouples components"));
    assert.equal(spy.mock.callCount(), 1);
  });

  it("calls claude path when model is claude (requires ANTHROPIC_API_KEY)", async () => {
    // The Anthropic SDK uses node-fetch internally (not globalThis.fetch),
    // so we can't mock it with t.mock.method. Instead verify it throws
    // the expected auth error when no API key is configured.
    if (config.anthropicApiKey) {
      // If a real key is available, skip — this is a unit test
      return;
    }
    await assert.rejects(
      () => summarizePost(fakePost, "claude"),
      { message: /authentication/i },
    );
  });
});
