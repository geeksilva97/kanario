import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateWorkflow } from "./generate.ts";
import type { HttpClient } from "../http.ts";
import { ConfigError } from "../errors/index.ts";

const fakeHttp: HttpClient = {
  baseUrl: "https://blog.codeminer42.com/wp-json/wp/v2",
  request: async () => new Response("{}"),
};

describe("generateWorkflow", () => {
  it("throws ConfigError on invalid model", async () => {
    await assert.rejects(
      // @ts-expect-error — intentionally passing invalid model to test error handling
      () => generateWorkflow({ wpHttp: fakeHttp, postId: "123", model: "gpt4", wide: true }),
      (err: unknown) => {
        if (!ConfigError.is(err)) return assert.fail("Expected ConfigError");
        assert.equal(err.type, "unknown_model");
        assert.match(err.message, /Unknown model "gpt4"/);
        return true;
      },
    );
  });

  it("throws ConfigError when RUNPOD_API_KEY is missing for qwen", async () => {
    await assert.rejects(
      () => generateWorkflow({ wpHttp: fakeHttp, postId: "123", model: "gemini", imageModel: "qwen", wide: true }),
      (err: unknown) => {
        if (!ConfigError.is(err)) return assert.fail("Expected ConfigError");
        assert.equal(err.type, "missing_env_vars");
        assert.match(err.message, /RUNPOD_API_KEY/);
        return true;
      },
    );
  });

  it("throws ConfigError when GEMINI_API_KEY is missing for gemini model", async () => {
    await assert.rejects(
      () => generateWorkflow({ wpHttp: fakeHttp, postId: "123", model: "gemini", imageModel: "qwen", wide: true }),
      (err: unknown) => {
        if (!ConfigError.is(err)) return assert.fail("Expected ConfigError");
        assert.equal(err.type, "missing_env_vars");
        assert.match(err.message, /GEMINI_API_KEY/);
        return true;
      },
    );
  });

  it("throws ConfigError when ANTHROPIC_API_KEY is missing for claude model", async () => {
    await assert.rejects(
      () => generateWorkflow({ wpHttp: fakeHttp, postId: "123", model: "claude", imageModel: "qwen", wide: true }),
      (err: unknown) => {
        if (!ConfigError.is(err)) return assert.fail("Expected ConfigError");
        assert.equal(err.type, "missing_env_vars");
        assert.match(err.message, /ANTHROPIC_API_KEY/);
        return true;
      },
    );
  });

});
