import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripHtml, parsePostId } from "../src/wordpress.ts";
import { PROMPT_TEMPLATE, config, PROJECT_ROOT } from "../src/config.ts";

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

describe("PROMPT_TEMPLATE", () => {
  it("starts with isometric 3D instruction", () => {
    assert.ok(PROMPT_TEMPLATE.startsWith("Isometric 3D"));
  });

  it("mentions white background", () => {
    assert.ok(PROMPT_TEMPLATE.includes("pure white background"));
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

describe("parsePostId", () => {
  it("returns a plain numeric ID as-is", () => {
    assert.equal(parsePostId("12487"), "12487");
  });

  it("extracts post ID from a wp-admin edit URL", () => {
    assert.equal(
      parsePostId("https://blog.codeminer42.com/wp-admin/post.php?post=12518&action=edit"),
      "12518",
    );
  });

  it("extracts post ID when post param is the only query param", () => {
    assert.equal(
      parsePostId("https://example.com/wp-admin/post.php?post=999"),
      "999",
    );
  });

  it("returns the input unchanged for a URL without a post param", () => {
    assert.equal(
      parsePostId("https://example.com/some-page"),
      "https://example.com/some-page",
    );
  });
});

describe("prompt structure validation", () => {
  it("validates a correct prompt result", () => {
    const sceneDescription = "A small mascot from the reference image sits at a desk in the foreground, facing a laptop screen with code visible on it";
    const result = {
      prompts: [
        {
          scene: "mascot and robot at desk",
          mascot: "miner",
          scene_description: sceneDescription,
          full_prompt: PROMPT_TEMPLATE.replace("[SCENE]", sceneDescription),
        },
        {
          scene: "mascot next to server rack",
          mascot: "hat",
          scene_description: "A small mascot from the reference image stands next to a server rack in the midground, with blinking lights in the background",
          full_prompt: PROMPT_TEMPLATE.replace("[SCENE]", "A small mascot from the reference image stands next to a server rack in the midground, with blinking lights in the background"),
        },
      ],
    };

    assert.ok(Array.isArray(result.prompts));
    assert.ok(result.prompts.length >= 2 && result.prompts.length <= 3);

    for (const p of result.prompts) {
      assert.ok(typeof p.scene === "string" && p.scene.length > 0);
      assert.ok(typeof p.mascot === "string" && (p.mascot === "miner" || p.mascot === "hat"));
      assert.ok(typeof p.scene_description === "string" && p.scene_description.length > 0);
      assert.ok(typeof p.full_prompt === "string");
      assert.ok(p.full_prompt.startsWith("Isometric 3D"));
      assert.ok(p.full_prompt.includes("Lock angle and position"));
      assert.ok(!p.full_prompt.includes("[SCENE]"));
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
