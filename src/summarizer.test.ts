import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizePost } from "./summarizer.ts";
import { config } from "./config.ts";

describe("summarizePost", () => {
  const fakePost = {
    title: "Understanding Dependency Injection in Ruby",
    content: "Dependency injection is a design pattern...",
    excerpt: "A guide to DI in Ruby.",
  };

  it("returns a summary string via gemini", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Core thesis: DI decouples components.\n- Benefit 1\n- Benefit 2" }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } })),
    );

    const summary = await summarizePost(fakePost, "gemini");
    assert.equal(typeof summary, "string");
    assert.ok(summary.length > 0);
  });

  it("calls claude path when model is claude (requires ANTHROPIC_API_KEY)", async (t) => {
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
