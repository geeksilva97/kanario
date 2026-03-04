import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pickWorkflow } from "./pick.ts";
import type { HttpClient } from "../http.ts";
import { FileError, HttpError, WordPressError } from "../errors/index.ts";

const fakeHttp: HttpClient = {
  baseUrl: "https://example.com/wp-json/wp/v2",
  request: async () => new Response("{}"),
};

describe("pickWorkflow", () => {
  let tmpDir: string;
  let tmpImage: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("throws FileError when file does not exist", async () => {
    await assert.rejects(
      () => pickWorkflow({ wpHttp: fakeHttp, postId: "123", imagePath: "/nonexistent/image.png" }),
      (err: unknown) => {
        if (!FileError.is(err)) return assert.fail("Expected FileError");
        assert.equal(err.type, "image_not_found");
        assert.match(err.message, /Image not found: \/nonexistent\/image\.png/);
        return true;
      },
    );
  });

  it("uploads and sets featured image", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-pick-test-"));
    tmpImage = path.join(tmpDir, "test.png");
    fs.writeFileSync(tmpImage, "fake-png");

    let callNum = 0;
    const http: HttpClient = {
      baseUrl: "https://example.com/wp-json/wp/v2",
      request: async () => {
        callNum++;
        if (callNum === 1) {
          return new Response(JSON.stringify({ id: 42 }));
        }
        if (callNum === 2) {
          return new Response("{}");
        }
        throw new Error(`Unexpected request call #${callNum}`);
      },
    };

    const result = await pickWorkflow({
      wpHttp: http,
      postId: "123",
      imagePath: tmpImage,
    });

    assert.equal(result.mediaId, 42);
  });

  it("throws WordPressError when upload fails", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-pick-test-"));
    tmpImage = path.join(tmpDir, "test.png");
    fs.writeFileSync(tmpImage, "fake-png");

    const wpBody = JSON.stringify({ code: "rest_cannot_create", message: "Sorry, you are not allowed to upload media." });
    const http: HttpClient = {
      baseUrl: "https://example.com/wp-json/wp/v2",
      request: async (_p, init) => {
        throw new HttpError(init?.method ?? "GET", "https://example.com/wp-json/wp/v2/media", 403, "Forbidden", wpBody);
      },
    };

    await assert.rejects(
      () => pickWorkflow({ wpHttp: http, postId: "123", imagePath: tmpImage }),
      (err: unknown) => {
        if (!WordPressError.is(err)) return assert.fail("Expected WordPressError");
        assert.equal(err.type, "wp_upload_failed");
        assert.equal(err.meta.status, 403);
        assert.equal(err.meta.wpCode, "rest_cannot_create");
        return true;
      },
    );
  });
});
