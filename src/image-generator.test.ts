import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createImageBackend } from "./image-generator.ts";
import { createQwenBackend } from "./qwen-backend.ts";
import { createNanoBananaBackend } from "./nano-banana-backend.ts";

describe("ImageBackend", () => {
  it("createQwenBackend returns an object with generate method", () => {
    const backend = createQwenBackend();
    assert.equal(typeof backend.generate, "function");
  });

  it("createNanoBananaBackend returns an object with generate method", () => {
    const backend = createNanoBananaBackend();
    assert.equal(typeof backend.generate, "function");
  });

  it('createImageBackend("qwen") returns a backend', () => {
    const backend = createImageBackend("qwen");
    assert.equal(typeof backend.generate, "function");
  });

  it('createImageBackend("nano-banana") returns a backend', () => {
    const backend = createImageBackend("nano-banana");
    assert.equal(typeof backend.generate, "function");
  });

  it("createImageBackend throws on invalid model", () => {
    assert.throws(
      () => createImageBackend("invalid" as any),
      { message: /Unknown image model "invalid"/ },
    );
  });
});
