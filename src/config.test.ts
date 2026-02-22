import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROMPT_TEMPLATE, config, PROJECT_ROOT } from "./config.ts";

describe("config", () => {
  it("has a default wpUrl", () => {
    assert.equal(config.wpUrl, "https://blog.codeminer42.com");
  });

  it("PROJECT_ROOT points to kanario root", () => {
    assert.ok(PROJECT_ROOT.endsWith("kanario"));
  });
});

describe("PROMPT_TEMPLATE", () => {
  it("starts with isometric 3D instruction", () => {
    assert.ok(PROMPT_TEMPLATE.startsWith("Isometric 3D"));
  });

  it("has [BACKGROUND] placeholder", () => {
    assert.ok(PROMPT_TEMPLATE.includes("[BACKGROUND]"));
  });

  it("includes Lock angle and position trick", () => {
    assert.ok(PROMPT_TEMPLATE.includes("Lock angle and position"));
  });

  it("has [SCENE] placeholder", () => {
    assert.ok(PROMPT_TEMPLATE.includes("[SCENE]"));
  });

  it("specifies 16:9 widescreen format", () => {
    assert.ok(PROMPT_TEMPLATE.includes("16:9"));
  });
});
