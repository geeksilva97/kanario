import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pickWorkflow } from "./pick.ts";
import type { WPCredentials } from "../credentials.ts";

const fakeCreds: WPCredentials = {
  wpUrl: "https://blog.codeminer42.com",
  wpUsername: "testuser",
  wpAppPassword: "xxxx xxxx xxxx",
};

describe("pickWorkflow", () => {
  let tmpDir: string;
  let tmpImage: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("throws when file does not exist", async () => {
    await assert.rejects(
      () => pickWorkflow({ creds: fakeCreds, postId: "123", imagePath: "/nonexistent/image.png" }),
      { message: /Image not found: \/nonexistent\/image\.png/ },
    );
  });

  it("uploads and sets featured image", async (t) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-pick-test-"));
    tmpImage = path.join(tmpDir, "test.png");
    fs.writeFileSync(tmpImage, "fake-png");

    let callNum = 0;
    t.mock.method(globalThis, "fetch", () => {
      callNum++;
      if (callNum === 1) {
        return Promise.resolve(new Response(JSON.stringify({ id: 42 })));
      }
      if (callNum === 2) {
        return Promise.resolve(new Response("{}"));
      }
      throw new Error(`Unexpected fetch call #${callNum}`);
    });

    const result = await pickWorkflow({
      creds: fakeCreds,
      postId: "123",
      imagePath: tmpImage,
    });

    assert.equal(result.mediaId, 42);
  });

  it("throws when upload fails", async (t) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-pick-test-"));
    tmpImage = path.join(tmpDir, "test.png");
    fs.writeFileSync(tmpImage, "fake-png");

    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response("Server Error", { status: 500, statusText: "Internal Server Error" })),
    );

    await assert.rejects(
      () => pickWorkflow({ creds: fakeCreds, postId: "123", imagePath: tmpImage }),
      { message: /Failed to upload media: 500 Internal Server Error/ },
    );
  });
});
