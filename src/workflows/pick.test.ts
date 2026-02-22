import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickWorkflow } from "./pick.ts";
import type { WPCredentials } from "../credentials.ts";

const fakeCreds: WPCredentials = {
  wpUrl: "https://blog.codeminer42.com",
  wpUsername: "testuser",
  wpAppPassword: "xxxx xxxx xxxx",
};

describe("pickWorkflow", () => {
  it("throws when file does not exist", async () => {
    await assert.rejects(
      () => pickWorkflow({ creds: fakeCreds, postId: "123", imagePath: "/nonexistent/image.png" }),
      { message: /Image not found: \/nonexistent\/image\.png/ },
    );
  });
});
