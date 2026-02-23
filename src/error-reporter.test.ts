import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatError } from "./error-reporter.ts";
import { WordPressError, ImageBackendError, ConfigError, FileError, KanarioError } from "./errors.ts";

describe("formatError", () => {
  it("returns message for KanarioError with no hint", () => {
    const err = new KanarioError("custom_type", "something happened");
    assert.equal(formatError(err), "something happened");
  });

  it("returns message for plain Error", () => {
    assert.equal(formatError(new Error("plain error")), "plain error");
  });

  it("returns String() for non-Error values", () => {
    assert.equal(formatError("string error"), "string error");
    assert.equal(formatError(42), "42");
    assert.equal(formatError(null), "null");
  });

  describe("WordPressError hints", () => {
    it("hints on 401 status", () => {
      const err = WordPressError.fetchFailed("123", 401, "Unauthorized");
      const result = formatError(err);
      assert.ok(result.includes("Failed to fetch post 123"));
      assert.ok(result.includes("Check WP_USERNAME and WP_APP_PASSWORD"));
    });

    it("hints on 403 status", () => {
      const err = WordPressError.setFeaturedFailed(403, "Forbidden");
      const result = formatError(err);
      assert.ok(result.includes("Check WP_USERNAME and WP_APP_PASSWORD"));
    });

    it("hints on 404 status", () => {
      const err = WordPressError.fetchFailed("999", 404, "Not Found");
      const result = formatError(err);
      assert.ok(result.includes("The post ID may be wrong"));
    });

    it("no hint on 500 status", () => {
      const err = WordPressError.uploadFailed(500, "Internal Server Error");
      const result = formatError(err);
      assert.equal(result, err.message);
    });

    it("no hint for slug not found (no status in meta)", () => {
      const err = WordPressError.slugNotFound("my-post");
      assert.equal(formatError(err), err.message);
    });
  });

  describe("ImageBackendError hints", () => {
    it("hints on retries_exhausted", () => {
      const err = ImageBackendError.retriesExhausted(6);
      const result = formatError(err);
      assert.ok(result.includes("Vertex AI is rate-limiting"));
    });

    it("no hint for other image backend errors", () => {
      const err = ImageBackendError.runpodApiError(500, "error");
      assert.equal(formatError(err), err.message);
    });
  });

  describe("ConfigError hints", () => {
    it("hints on missing_env_vars", () => {
      const err = ConfigError.missingEnvVars(["GEMINI_API_KEY"]);
      const result = formatError(err);
      assert.ok(result.includes("Set the missing variables"));
    });

    it("no hint for unknown_model", () => {
      const err = ConfigError.unknownModel("gpt4");
      assert.equal(formatError(err), err.message);
    });
  });

  describe("FileError hints", () => {
    it("hints on image_not_found", () => {
      const err = FileError.imageNotFound("/tmp/img.png");
      const result = formatError(err);
      assert.ok(result.includes("Run ./kanario"));
    });
  });
});
