import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveImagePath } from "./pick.ts";
import { OUTPUT_DIR } from "../config.ts";

describe("resolveImagePath", () => {
  it("resolves numeric shorthand to output directory", () => {
    const result = resolveImagePath("12518", "2");
    assert.equal(result, path.join(OUTPUT_DIR, "12518", "prompt-2.png"));
  });

  it("resolves legacy shorthand with suffix to output directory", () => {
    const result = resolveImagePath("12518", "2a");
    assert.equal(result, path.join(OUTPUT_DIR, "12518", "prompt-2a.png"));
  });

  it("returns URL as-is", () => {
    const result = resolveImagePath("12518", "https://cdn.example.com/image.png");
    assert.equal(result, "https://cdn.example.com/image.png");
  });

  it("returns absolute path as-is", () => {
    const result = resolveImagePath("12518", "/tmp/custom.png");
    assert.equal(result, "/tmp/custom.png");
  });

  it("resolves relative path to absolute", () => {
    const result = resolveImagePath("12518", "some/image.png");
    assert.equal(result, path.resolve("some/image.png"));
  });

  it("resolves cross-ID reference to output directory", () => {
    const result = resolveImagePath("12518", "a3f7c912/1");
    assert.equal(result, path.join(OUTPUT_DIR, "a3f7c912", "prompt-1.png"));
  });

  it("resolves cross-ID reference with full UUID", () => {
    const result = resolveImagePath("12518", "4b374189/2");
    assert.equal(result, path.join(OUTPUT_DIR, "4b374189", "prompt-2.png"));
  });
});
