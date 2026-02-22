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
});
