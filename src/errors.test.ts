import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KanarioError, WordPressError, ImageBackendError, ConfigError, FileError } from "./errors.ts";

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

describe("WordPressError", () => {
  it("is() detects WordPressError but not sibling classes", () => {
    assert.ok(WordPressError.is(WordPressError.fetchFailed("1", 404, "Not Found")));
    assert.ok(!WordPressError.is(new ImageBackendError("t", "m")));
    assert.ok(!WordPressError.is(new Error("plain")));
  });

  it(".fetchFailed() sets correct type, message, and meta", () => {
    const err = WordPressError.fetchFailed("123", 404, "Not Found");
    assert.ok(err instanceof WordPressError);
    assert.ok(err instanceof KanarioError);
    assert.equal(err.type, "wp_fetch_failed");
    assert.equal(err.message, "Failed to fetch post 123: 404 Not Found");
    assert.deepEqual(err.meta, { postId: "123", status: 404, statusText: "Not Found" });
  });

  it(".slugNotFound() sets correct type and meta", () => {
    const err = WordPressError.slugNotFound("my-post");
    assert.equal(err.type, "wp_slug_not_found");
    assert.equal(err.message, 'No post found with slug "my-post"');
    assert.deepEqual(err.meta, { slug: "my-post" });
  });

  it(".unresolvableInput() sets correct type and meta", () => {
    const err = WordPressError.unresolvableInput("just-a-slug");
    assert.equal(err.type, "wp_unresolvable_input");
    assert.equal(err.message, "Cannot resolve post from input: just-a-slug");
    assert.deepEqual(err.meta, { input: "just-a-slug" });
  });

  it(".uploadFailed() sets correct type and meta", () => {
    const err = WordPressError.uploadFailed(500, "Internal Server Error");
    assert.equal(err.type, "wp_upload_failed");
    assert.deepEqual(err.meta, { status: 500, statusText: "Internal Server Error" });
  });

  it(".setFeaturedFailed() sets correct type and meta", () => {
    const err = WordPressError.setFeaturedFailed(403, "Forbidden");
    assert.equal(err.type, "wp_set_featured_failed");
    assert.deepEqual(err.meta, { status: 403, statusText: "Forbidden" });
  });

  it(".slugLookupFailed() sets correct type and meta", () => {
    const err = WordPressError.slugLookupFailed("my-slug", 401, "Unauthorized");
    assert.equal(err.type, "wp_slug_lookup_failed");
    assert.deepEqual(err.meta, { slug: "my-slug", status: 401, statusText: "Unauthorized" });
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
    assert.deepEqual(err.meta, { status: 500, body: "server error" });
  });

  it(".runpodJobFailed() sets correct type and meta", () => {
    const payload = { status: "FAILED", error: "OOM" };
    const err = ImageBackendError.runpodJobFailed("job-1", payload);
    assert.equal(err.type, "runpod_job_failed");
    assert.deepEqual(err.meta, { jobId: "job-1", statusPayload: payload });
  });

  it(".downloadFailed() sets correct type and meta", () => {
    const err = ImageBackendError.downloadFailed(404);
    assert.equal(err.type, "download_failed");
    assert.deepEqual(err.meta, { status: 404 });
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
