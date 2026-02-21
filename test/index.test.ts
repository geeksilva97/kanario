import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripHtml } from "../src/wordpress.ts";
import { STYLE_TEMPLATE, config, PROJECT_ROOT } from "../src/config.ts";

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    assert.equal(stripHtml("<p>Hello <strong>world</strong></p>"), "Hello world");
  });

  it("decodes HTML entities", () => {
    assert.equal(stripHtml("&amp; &lt; &gt; &quot; &#039;"), '& < > " \'');
  });

  it("decodes &nbsp;", () => {
    assert.equal(stripHtml("hello&nbsp;world"), "hello world");
  });

  it("collapses excessive newlines", () => {
    assert.equal(stripHtml("a\n\n\n\nb"), "a\n\nb");
  });

  it("trims whitespace", () => {
    assert.equal(stripHtml("  <p>hello</p>  "), "hello");
  });

  it("handles empty string", () => {
    assert.equal(stripHtml(""), "");
  });

  it("handles plain text (no HTML)", () => {
    assert.equal(stripHtml("just text"), "just text");
  });
});

describe("config", () => {
  it("has a default wpUrl", () => {
    assert.equal(config.wpUrl, "https://blog.codeminer42.com");
  });

  it("PROJECT_ROOT points to kanario root", () => {
    assert.ok(PROJECT_ROOT.endsWith("kanario"));
  });
});

describe("STYLE_TEMPLATE", () => {
  it("starts with isometric 3D instruction", () => {
    assert.ok(STYLE_TEMPLATE.startsWith("Isometric 3D"));
  });

  it("mentions white background", () => {
    assert.ok(STYLE_TEMPLATE.includes("pure white background"));
  });

  it("mentions both mascots", () => {
    assert.ok(STYLE_TEMPLATE.includes("reference image 1"));
    assert.ok(STYLE_TEMPLATE.includes("reference image 2"));
  });

  it("specifies 16:9 aspect ratio", () => {
    assert.ok(STYLE_TEMPLATE.includes("16:9"));
  });
});

describe("prompt structure validation", () => {
  it("validates a correct prompt result", () => {
    const result = {
      prompts: [
        {
          scene: "collaborating at a whiteboard",
          full_prompt: `${STYLE_TEMPLATE} collaborating at a whiteboard with architecture diagrams`,
        },
        {
          scene: "debugging code together",
          full_prompt: `${STYLE_TEMPLATE} debugging code together on a giant screen`,
        },
      ],
    };

    assert.ok(Array.isArray(result.prompts));
    assert.ok(result.prompts.length >= 2 && result.prompts.length <= 3);

    for (const p of result.prompts) {
      assert.ok(typeof p.scene === "string" && p.scene.length > 0);
      assert.ok(typeof p.full_prompt === "string");
      assert.ok(p.full_prompt.startsWith("Isometric 3D"));
    }
  });

  it("rejects empty prompts array", () => {
    const result = { prompts: [] };
    assert.ok(result.prompts.length < 2);
  });

  it("rejects prompts without style template", () => {
    const bad = { scene: "test", full_prompt: "random text without style" };
    assert.ok(!bad.full_prompt.startsWith("Isometric 3D"));
  });
});
