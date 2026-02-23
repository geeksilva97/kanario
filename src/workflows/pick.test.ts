import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pickWorkflow } from "./pick.ts";
import type { HttpClient } from "../http.ts";
import { FileError, HttpError } from "../errors.ts";

const fakeHttp: HttpClient = {
  baseUrl: "https://blog.codeminer42.com/wp-json/wp/v2",
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
      (err: any) => {
        assert.ok(FileError.is(err));
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
      baseUrl: "https://blog.codeminer42.com/wp-json/wp/v2",
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

  it("throws HttpError when upload fails", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanario-pick-test-"));
    tmpImage = path.join(tmpDir, "test.png");
    fs.writeFileSync(tmpImage, "fake-png");

    const http: HttpClient = {
      baseUrl: "https://blog.codeminer42.com/wp-json/wp/v2",
      request: async (_p, init) => {
        throw new HttpError(init?.method ?? "GET", "https://blog.codeminer42.com/wp-json/wp/v2/media", 500, "Internal Server Error", "Server Error");
      },
    };

    await assert.rejects(
      () => pickWorkflow({ wpHttp: http, postId: "123", imagePath: tmpImage }),
      (err: any) => {
        assert.ok(HttpError.is(err));
        assert.equal(err.meta.status, 500);
        return true;
      },
    );
  });
});
