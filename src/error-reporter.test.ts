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

  describe("WordPressError wpCode hints", () => {
    it("hints on rest_post_invalid_id", () => {
      const err = WordPressError.fetchFailed("123", 404, "Not Found", JSON.stringify({ code: "rest_post_invalid_id" }));
      assert.ok(formatError(err).includes("doesn't exist or belongs to a different post type"));
    });

    it("hints on rest_forbidden_context", () => {
      const err = WordPressError.fetchFailed("123", 403, "Forbidden", JSON.stringify({ code: "rest_forbidden_context" }));
      assert.ok(formatError(err).includes("edit permissions"));
    });

    it("hints on rest_post_incorrect_password", () => {
      const err = WordPressError.fetchFailed("123", 403, "Forbidden", JSON.stringify({ code: "rest_post_incorrect_password" }));
      assert.ok(formatError(err).includes("password-protected"));
    });

    it("hints on rest_cannot_create", () => {
      const err = WordPressError.uploadFailed(403, "Forbidden", JSON.stringify({ code: "rest_cannot_create" }));
      assert.ok(formatError(err).includes("upload_files capability"));
    });

    it("hints on rest_cannot_edit", () => {
      const err = WordPressError.setFeaturedFailed(403, "Forbidden", JSON.stringify({ code: "rest_cannot_edit" }));
      assert.ok(formatError(err).includes("permission to edit"));
    });

    it("hints on rest_invalid_featured_media", () => {
      const err = WordPressError.setFeaturedFailed(400, "Bad Request", JSON.stringify({ code: "rest_invalid_featured_media" }));
      assert.ok(formatError(err).includes("media ID is invalid"));
    });

    it("hints on rest_upload_no_data", () => {
      const err = WordPressError.uploadFailed(400, "Bad Request", JSON.stringify({ code: "rest_upload_no_data" }));
      assert.ok(formatError(err).includes("upload body was empty"));
    });

    it("hints on rest_upload_sideload_error", () => {
      const err = WordPressError.uploadFailed(500, "Internal Server Error", JSON.stringify({ code: "rest_upload_sideload_error" }));
      assert.ok(formatError(err).includes("file type is allowed"));
    });

    it("hints on rest_upload_unknown_error", () => {
      const err = WordPressError.uploadFailed(500, "Internal Server Error", JSON.stringify({ code: "rest_upload_unknown_error" }));
      assert.ok(formatError(err).includes("file type is allowed"));
    });

    it("hints on rest_upload_file_too_big", () => {
      const err = WordPressError.uploadFailed(413, "Payload Too Large", JSON.stringify({ code: "rest_upload_file_too_big" }));
      assert.ok(formatError(err).includes("upload size limit"));
    });

    it("hints on rest_upload_limited_space", () => {
      const err = WordPressError.uploadFailed(500, "Internal Server Error", JSON.stringify({ code: "rest_upload_limited_space" }));
      assert.ok(formatError(err).includes("run out of upload space"));
    });

    it("hints on rest_upload_hash_mismatch", () => {
      const err = WordPressError.uploadFailed(500, "Internal Server Error", JSON.stringify({ code: "rest_upload_hash_mismatch" }));
      assert.ok(formatError(err).includes("hash mismatch"));
    });

    it("hints on rest_forbidden_status", () => {
      const err = WordPressError.slugLookupFailed("my-post", 403, "Forbidden", JSON.stringify({ code: "rest_forbidden_status" }));
      assert.ok(formatError(err).includes("edit_posts capability"));
    });

    it("hints on db_update_error", () => {
      const err = WordPressError.setFeaturedFailed(500, "Internal Server Error", JSON.stringify({ code: "db_update_error" }));
      assert.ok(formatError(err).includes("database write failed"));
    });
  });

  describe("WordPressError status fallback hints", () => {
    it("falls back to 401 hint when wpCode is unrecognized", () => {
      const err = WordPressError.fetchFailed("123", 401, "Unauthorized", JSON.stringify({ code: "unknown_code" }));
      assert.ok(formatError(err).includes("Check WP_USERNAME and WP_APP_PASSWORD"));
    });

    it("falls back to 403 hint when wpCode is null", () => {
      const err = WordPressError.setFeaturedFailed(403, "Forbidden", "not json");
      assert.ok(formatError(err).includes("lacks the required permissions"));
    });

    it("falls back to 404 hint when wpCode is null", () => {
      const err = WordPressError.fetchFailed("999", 404, "Not Found", "not json");
      assert.ok(formatError(err).includes("The post ID may be wrong"));
    });

    it("falls back to 500 hint when wpCode is null", () => {
      const err = WordPressError.uploadFailed(500, "Internal Server Error", "not json");
      assert.ok(formatError(err).includes("WordPress server error"));
    });

    it("no hint when status has no fallback and wpCode is null", () => {
      const err = WordPressError.uploadFailed(418, "I'm a Teapot", "not json");
      assert.equal(formatError(err), err.message);
    });

    it("no hint for errors without status", () => {
      const err = WordPressError.slugNotFound("my-post");
      assert.equal(formatError(err), err.message);
    });

    it("wpCode takes precedence over status fallback", () => {
      const err = WordPressError.fetchFailed("123", 404, "Not Found", JSON.stringify({ code: "rest_post_invalid_id" }));
      const result = formatError(err);
      assert.ok(result.includes("doesn't exist or belongs to a different post type"));
      assert.ok(!result.includes("The post ID may be wrong"));
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
