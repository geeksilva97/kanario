import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateWorkflow } from "./generate.ts";
import type { WPCredentials } from "../credentials.ts";
import { ConfigError } from "../errors.ts";

const fakeCreds: WPCredentials = {
  wpUrl: "https://blog.codeminer42.com",
  wpUsername: "testuser",
  wpAppPassword: "xxxx xxxx xxxx",
};

describe("generateWorkflow", () => {
  it("throws ConfigError on invalid model", async () => {
    await assert.rejects(
      () => generateWorkflow({ creds: fakeCreds, postId: "123", model: "gpt4" as any, wide: true }),
      (err: any) => {
        assert.ok(ConfigError.is(err));
        assert.equal(err.type, "unknown_model");
        assert.match(err.message, /Unknown model "gpt4"/);
        return true;
      },
    );
  });

  it("throws ConfigError when RUNPOD_API_KEY is missing for qwen", async () => {
    await assert.rejects(
      () => generateWorkflow({ creds: fakeCreds, postId: "123", model: "gemini", imageModel: "qwen", wide: true }),
      (err: any) => {
        assert.ok(ConfigError.is(err));
        assert.equal(err.type, "missing_env_vars");
        assert.match(err.message, /RUNPOD_API_KEY/);
        return true;
      },
    );
  });

  it("throws ConfigError when GEMINI_API_KEY is missing for gemini model", async () => {
    await assert.rejects(
      () => generateWorkflow({ creds: fakeCreds, postId: "123", model: "gemini", imageModel: "qwen", wide: true }),
      (err: any) => {
        assert.ok(ConfigError.is(err));
        assert.equal(err.type, "missing_env_vars");
        assert.match(err.message, /GEMINI_API_KEY/);
        return true;
      },
    );
  });

  it("throws ConfigError when ANTHROPIC_API_KEY is missing for claude model", async () => {
    await assert.rejects(
      () => generateWorkflow({ creds: fakeCreds, postId: "123", model: "claude", imageModel: "qwen", wide: true }),
      (err: any) => {
        assert.ok(ConfigError.is(err));
        assert.equal(err.type, "missing_env_vars");
        assert.match(err.message, /ANTHROPIC_API_KEY/);
        return true;
      },
    );
  });

  it("throws ConfigError when GEMINI_API_KEY is missing for nano-banana", async () => {
    await assert.rejects(
      () => generateWorkflow({ creds: fakeCreds, postId: "123", model: "claude", imageModel: "nano-banana", wide: true }),
      (err: any) => {
        assert.ok(ConfigError.is(err));
        assert.equal(err.type, "missing_env_vars");
        assert.match(err.message, /GEMINI_API_KEY/);
        return true;
      },
    );
  });
});
