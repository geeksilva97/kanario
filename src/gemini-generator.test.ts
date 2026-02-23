import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { buildFullPrompt } from "./prompt-generator.ts";

// File-level mock: swap implementation per test via shared variable
let generateContentImpl: Function;

// @ts-expect-error — mock.module requires --experimental-test-module-mocks
mock.module("@google/genai", {
  namedExports: {
    GoogleGenAI: class {
      models = { generateContent: (...args: any[]) => generateContentImpl(...args) };
    },
    Type: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING" },
  },
});

const { generatePrompts } = await import("./gemini-generator.ts");

describe("Gemini generatePrompts", () => {
  it("returns prompts with full_prompt filled in (happy path)", async (t) => {
    const spy = t.mock.fn(async () => ({
      text: JSON.stringify({
        prompts: [
          {
            scene: "mascot at desk",
            mascot: "miner",
            background: "sky",
            scene_description: "The mascot from the reference image sits at a wooden desk",
          },
          {
            scene: "floating books",
            mascot: "none",
            background: "cream",
            scene_description: "Ignore the reference image. Books float in a spiral",
          },
        ],
      }),
    }));
    generateContentImpl = spy;

    const result = await generatePrompts({
      title: "Understanding React Hooks",
      content: "React hooks allow you to use state...",
      excerpt: "A guide to hooks",
    });

    assert.equal(result.prompts.length, 2);
    assert.equal(result.prompts[0].scene, "mascot at desk");
    assert.equal(result.prompts[0].mascot, "miner");
    assert.equal(
      result.prompts[0].full_prompt,
      buildFullPrompt("The mascot from the reference image sits at a wooden desk", "sky"),
    );
    assert.equal(result.prompts[1].mascot, "none");
    assert.equal(spy.mock.callCount(), 1);
  });

  it("includes hint in user message when provided", async (t) => {
    const spy = t.mock.fn(async () => ({
      text: JSON.stringify({
        prompts: [{
          scene: "mining scene",
          mascot: "miner",
          background: "white",
          scene_description: "The mascot mines gold",
        }],
      }),
    }));
    generateContentImpl = spy;

    await generatePrompts(
      { title: "Test Post", content: "content", excerpt: "" },
      "use a space theme",
    );

    const call = (spy.mock.calls[0] as any).arguments[0];
    const userMessage = call.contents as string;
    assert.ok(userMessage.includes("use a space theme"), "hint should appear in user message");
  });

  it("uses summary instead of content when available", async (t) => {
    const spy = t.mock.fn(async () => ({
      text: JSON.stringify({
        prompts: [{
          scene: "summary scene",
          mascot: "hat",
          background: "mint",
          scene_description: "A scene based on summary",
        }],
      }),
    }));
    generateContentImpl = spy;

    await generatePrompts({
      title: "Test",
      content: "very long content that should not appear",
      excerpt: "",
      summary: "concise summary of the post",
    });

    const call = (spy.mock.calls[0] as any).arguments[0];
    const userMessage = call.contents as string;
    assert.ok(userMessage.includes("concise summary of the post"));
    assert.ok(!userMessage.includes("very long content"));
  });

  it("throws when API returns invalid JSON", async () => {
    generateContentImpl = async () => ({ text: "not valid json" });

    await assert.rejects(
      () => generatePrompts({ title: "Test", content: "c", excerpt: "" }),
    );
  });
});
