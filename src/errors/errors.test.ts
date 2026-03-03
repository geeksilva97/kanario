import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KanarioError, HttpError, WordPressError, ImageBackendError, ConfigError, FileError, parseWpErrorCode } from "./index.ts";

describe("KanarioError", () => {
  it("sets type, message, and meta", () => {
    const err = new KanarioError("test_type", "test message", { key: "value" });
    assert.equal(err.type, "test_type");
    assert.equal(err.message, "test message");
    assert.deepEqual(err.meta, { key: "value" });
    assert.equal(err.name, "KanarioError");
  });

  it("defaults meta to empty object", () => {
    const err = new KanarioError("t", "m");
    assert.deepEqual(err.meta, {});
  });

  it("is an instance of Error", () => {
    const err = new KanarioError("t", "m");
    assert.ok(err instanceof Error);
  });

  it("is() detects KanarioError instances", () => {
    assert.ok(KanarioError.is(new KanarioError("t", "m")));
    assert.ok(KanarioError.is(new WordPressError("t", "m")));
    assert.ok(!KanarioError.is(new Error("plain")));
    assert.ok(!KanarioError.is("string"));
  });
});

describe("HttpError", () => {
  it("sets type, message, and meta", () => {
    const err = new HttpError("POST", "https://api.example.com/data", 500, "Internal Server Error", "body text");
    assert.equal(err.type, "http_error");
    assert.equal(err.message, "POST https://api.example.com/data failed: 500 Internal Server Error");
    assert.deepEqual(err.meta, {
      method: "POST",
      url: "https://api.example.com/data",
      status: 500,
      statusText: "Internal Server Error",
      body: "body text",
    });
    assert.equal(err.name, "HttpError");
  });

  it("is() detects HttpError but not sibling classes", () => {
    assert.ok(HttpError.is(new HttpError("GET", "/url", 404, "Not Found", "")));
    assert.ok(!HttpError.is(new WordPressError("t", "m")));
    assert.ok(!HttpError.is(new Error("plain")));
  });

  it("is a KanarioError", () => {
    const err = new HttpError("GET", "/url", 404, "Not Found", "");
    assert.ok(err instanceof KanarioError);
    assert.ok(KanarioError.is(err));
  });
});

describe("WordPressError", () => {
  it("is() detects WordPressError but not sibling classes", () => {
    assert.ok(WordPressError.is(WordPressError.slugNotFound("my-post")));
    assert.ok(!WordPressError.is(new ImageBackendError("t", "m")));
    assert.ok(!WordPressError.is(new Error("plain")));
  });

  it(".fetchFailed() sets correct type and meta with wpCode", () => {
    const body = JSON.stringify({ code: "rest_post_invalid_id", message: "Invalid post ID." });
    const err = WordPressError.fetchFailed("123", 404, "Not Found", body);
    assert.equal(err.type, "wp_fetch_failed");
    assert.equal(err.message, "Failed to fetch post 123: 404 Not Found");
    assert.deepEqual(err.meta, { postId: "123", status: 404, statusText: "Not Found", wpCode: "rest_post_invalid_id" });
  });

  it(".slugLookupFailed() sets correct type and meta with wpCode", () => {
    const body = JSON.stringify({ code: "rest_forbidden_status", message: "Forbidden." });
    const err = WordPressError.slugLookupFailed("my-post", 403, "Forbidden", body);
    assert.equal(err.type, "wp_slug_lookup_failed");
    assert.equal(err.message, 'Slug lookup failed for "my-post": 403 Forbidden');
    assert.deepEqual(err.meta, { slug: "my-post", status: 403, statusText: "Forbidden", wpCode: "rest_forbidden_status" });
  });

  it(".slugNotFound() sets correct type and meta", () => {
    const err = WordPressError.slugNotFound("my-post");
    assert.equal(err.type, "wp_slug_not_found");
    assert.equal(err.message, 'No post found with slug "my-post"');
    assert.deepEqual(err.meta, { slug: "my-post" });
  });

  it(".uploadFailed() sets correct type and meta with wpCode", () => {
    const body = JSON.stringify({ code: "rest_upload_file_too_big", message: "File too large." });
    const err = WordPressError.uploadFailed(413, "Payload Too Large", body);
    assert.equal(err.type, "wp_upload_failed");
    assert.equal(err.message, "Media upload failed: 413 Payload Too Large");
    assert.deepEqual(err.meta, { status: 413, statusText: "Payload Too Large", wpCode: "rest_upload_file_too_big" });
  });

  it(".setFeaturedFailed() sets correct type and meta with wpCode", () => {
    const body = JSON.stringify({ code: "rest_cannot_edit", message: "Cannot edit." });
    const err = WordPressError.setFeaturedFailed(403, "Forbidden", body);
    assert.equal(err.type, "wp_set_featured_failed");
    assert.equal(err.message, "Setting featured image failed: 403 Forbidden");
    assert.deepEqual(err.meta, { status: 403, statusText: "Forbidden", wpCode: "rest_cannot_edit" });
  });

  it(".unresolvableInput() sets correct type and meta", () => {
    const err = WordPressError.unresolvableInput("just-a-slug");
    assert.equal(err.type, "wp_unresolvable_input");
    assert.equal(err.message, "Cannot resolve post from input: just-a-slug");
    assert.deepEqual(err.meta, { input: "just-a-slug" });
  });

  it("sets wpCode to null for non-JSON body", () => {
    const err = WordPressError.fetchFailed("123", 500, "Internal Server Error", "not json");
    assert.equal(err.meta.wpCode, null);
  });

  it("sets wpCode to null for JSON without code field", () => {
    const err = WordPressError.fetchFailed("123", 500, "Internal Server Error", JSON.stringify({ message: "error" }));
    assert.equal(err.meta.wpCode, null);
  });
});

describe("parseWpErrorCode", () => {
  it("extracts code from valid WP JSON", () => {
    assert.equal(parseWpErrorCode(JSON.stringify({ code: "rest_post_invalid_id", message: "Invalid." })), "rest_post_invalid_id");
  });

  it("returns null for non-JSON body", () => {
    assert.equal(parseWpErrorCode("Not Found"), null);
  });

  it("returns null for JSON without code field", () => {
    assert.equal(parseWpErrorCode(JSON.stringify({ message: "error" })), null);
  });

  it("returns null for JSON with non-string code", () => {
    assert.equal(parseWpErrorCode(JSON.stringify({ code: 42 })), null);
  });
});

describe("ImageBackendError", () => {
  it("is() detects ImageBackendError but not sibling classes", () => {
    assert.ok(ImageBackendError.is(ImageBackendError.noImageData()));
    assert.ok(!ImageBackendError.is(new WordPressError("t", "m")));
  });

  it(".runpodApiError() sets correct type and meta", () => {
    const err = ImageBackendError.runpodApiError(500, "server error");
    assert.equal(err.type, "runpod_api_error");
    assert.equal(err.message, "RunPod API error: 500 — server error");
    assert.deepEqual(err.meta, { status: 500, body: "server error" });
  });

  it(".downloadFailed() sets correct type and meta", () => {
    const err = ImageBackendError.downloadFailed(404);
    assert.equal(err.type, "download_failed");
    assert.equal(err.message, "Image download failed: 404");
    assert.deepEqual(err.meta, { status: 404 });
  });

  it(".runpodJobFailed() sets correct type and meta", () => {
    const payload = { status: "FAILED", error: "OOM" };
    const err = ImageBackendError.runpodJobFailed("job-1", payload);
    assert.equal(err.type, "runpod_job_failed");
    assert.deepEqual(err.meta, { jobId: "job-1", statusPayload: payload });
  });

  it(".noImageData() sets correct type", () => {
    const err = ImageBackendError.noImageData();
    assert.equal(err.type, "no_image_data");
    assert.equal(err.message, "Nano Banana returned no image data");
  });

  it(".retriesExhausted() sets correct type and meta", () => {
    const err = ImageBackendError.retriesExhausted(6);
    assert.equal(err.type, "retries_exhausted");
    assert.deepEqual(err.meta, { retries: 6 });
  });

  it(".unreadableMascot() sets correct type and meta", () => {
    const err = ImageBackendError.unreadableMascot("/path/to/mascot.png");
    assert.equal(err.type, "unreadable_mascot");
    assert.deepEqual(err.meta, { mascotPath: "/path/to/mascot.png" });
  });

  it(".unknownModel() sets correct type and meta", () => {
    const err = ImageBackendError.unknownModel("invalid");
    assert.equal(err.type, "unknown_image_model");
    assert.deepEqual(err.meta, { model: "invalid" });
  });
});

describe("ConfigError", () => {
  it("is() detects ConfigError but not sibling classes", () => {
    assert.ok(ConfigError.is(ConfigError.unknownModel("gpt4")));
    assert.ok(!ConfigError.is(new WordPressError("t", "m")));
  });

  it(".missingEnvVars() sets correct type and meta", () => {
    const err = ConfigError.missingEnvVars(["GEMINI_API_KEY", "RUNPOD_API_KEY"]);
    assert.equal(err.type, "missing_env_vars");
    assert.equal(err.message, "Missing environment variables: GEMINI_API_KEY, RUNPOD_API_KEY");
    assert.deepEqual(err.meta, { vars: ["GEMINI_API_KEY", "RUNPOD_API_KEY"] });
  });

  it(".unknownModel() sets correct type and meta", () => {
    const err = ConfigError.unknownModel("gpt4");
    assert.equal(err.type, "unknown_model");
    assert.deepEqual(err.meta, { model: "gpt4" });
  });
});

describe("FileError", () => {
  it("is() detects FileError but not sibling classes", () => {
    assert.ok(FileError.is(FileError.imageNotFound("/tmp/img.png")));
    assert.ok(!FileError.is(new ConfigError("t", "m")));
  });

  it(".imageNotFound() sets correct type and meta", () => {
    const err = FileError.imageNotFound("/tmp/image.png");
    assert.equal(err.type, "image_not_found");
    assert.equal(err.message, "Image not found: /tmp/image.png");
    assert.deepEqual(err.meta, { imagePath: "/tmp/image.png" });
  });
});
