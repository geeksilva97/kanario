import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatError } from "./error-reporter.ts";
import { HttpError, ImageBackendError, ConfigError, FileError, KanarioError } from "./errors.ts";

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

  describe("HttpError hints", () => {
    it("hints on 401 status for WordPress URLs", () => {
      const err = new HttpError("GET", "https://blog.example.com/wp-json/wp/v2/posts/123", 401, "Unauthorized", "");
      const result = formatError(err);
      assert.ok(result.includes("failed: 401"));
      assert.ok(result.includes("Check WP_USERNAME and WP_APP_PASSWORD"));
    });

    it("hints on 403 status for WordPress URLs", () => {
      const err = new HttpError("POST", "https://blog.example.com/wp-json/wp/v2/posts/123", 403, "Forbidden", "");
      const result = formatError(err);
      assert.ok(result.includes("Check WP_USERNAME and WP_APP_PASSWORD"));
    });

    it("hints on 404 status for WordPress URLs", () => {
      const err = new HttpError("GET", "https://blog.example.com/wp-json/wp/v2/posts/999", 404, "Not Found", "");
      const result = formatError(err);
      assert.ok(result.includes("The post ID may be wrong"));
    });

    it("no hint on 500 status for WordPress URLs", () => {
      const err = new HttpError("POST", "https://blog.example.com/wp-json/wp/v2/media", 500, "Internal Server Error", "");
      const result = formatError(err);
      assert.equal(result, err.message);
    });

    it("no hint for non-WordPress URLs", () => {
      const err = new HttpError("POST", "https://api.runpod.ai/v2/qwen/run", 500, "Internal Server Error", "body");
      const result = formatError(err);
      assert.equal(result, err.message);
    });
  });

  describe("ImageBackendError hints", () => {
    it("hints on retries_exhausted", () => {
      const err = ImageBackendError.retriesExhausted(6);
      const result = formatError(err);
      assert.ok(result.includes("Vertex AI is rate-limiting"));
    });

    it("no hint for other image backend errors", () => {
      const err = ImageBackendError.noImageData();
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
