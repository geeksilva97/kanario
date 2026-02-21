import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { stripHtml, parsePostId, resolvePostId } from "../src/wordpress.ts";
import { PROMPT_TEMPLATE, BACKGROUND_COLORS, config, PROJECT_ROOT, OUTPUT_DIR } from "../src/config.ts";
import { buildFullPrompt } from "../src/prompt-generator.ts";
import { resolveImagePath } from "../src/commands/pick.ts";
import { generateWorkflow } from "../src/workflows/generate.ts";
import { pickWorkflow } from "../src/workflows/pick.ts";
import { verifySignature } from "../src/discord/server.ts";

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

describe("resolvePostId", () => {
  it("returns a plain numeric ID without making HTTP calls", async () => {
    const result = await resolvePostId("12487");
    assert.equal(result, "12487");
  });

  it("extracts post ID from a wp-admin edit URL without HTTP calls", async () => {
    const result = await resolvePostId(
      "https://blog.codeminer42.com/wp-admin/post.php?post=12518&action=edit",
    );
    assert.equal(result, "12518");
  });

  it("resolves a published blog URL via slug lookup", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify([{ id: 99 }]), { status: 200 })),
    );

    const result = await resolvePostId("https://blog.codeminer42.com/some-slug/");
    assert.equal(result, "99");
    assert.equal(mockFetch.mock.callCount(), 1);
    const calledUrl = String(mockFetch.mock.calls[0].arguments[0]);
    assert.ok(calledUrl.includes("slug=some-slug"));
  });

  it("throws when slug lookup returns no matches", async (t) => {
    t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    );

    await assert.rejects(
      () => resolvePostId("https://blog.codeminer42.com/nonexistent-post/"),
      { message: /No post found with slug "nonexistent-post"/ },
    );
  });

  it("strips trailing slash from the slug", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify([{ id: 42 }]), { status: 200 })),
    );

    const result = await resolvePostId("https://blog.codeminer42.com/my-post/");
    assert.equal(result, "42");
    const calledUrl = String(mockFetch.mock.calls[0].arguments[0]);
    assert.ok(calledUrl.includes("slug=my-post"));
    assert.ok(!calledUrl.includes("slug=my-post/"));
  });

  it("handles nested path as slug", async (t) => {
    const mockFetch = t.mock.method(globalThis, "fetch", () =>
      Promise.resolve(new Response(JSON.stringify([{ id: 77 }]), { status: 200 })),
    );

    const result = await resolvePostId("https://blog.codeminer42.com/category/post-slug/");
    assert.equal(result, "77");
    const calledUrl = String(mockFetch.mock.calls[0].arguments[0]);
    assert.ok(calledUrl.includes("slug=category%2Fpost-slug"));
  });

  it("throws for a bare slug without URL scheme", async () => {
    await assert.rejects(
      () => resolvePostId("just-a-slug"),
      { message: /Cannot resolve post from input: just-a-slug/ },
    );
  });
});

describe("buildFullPrompt", () => {
  it("interpolates scene and background into the template", () => {
    const result = buildFullPrompt(
      "A small mascot sits at a tiny desk with a glowing laptop",
      "cream",
    );
    assert.ok(result.startsWith("Isometric 3D"));
    assert.ok(result.includes("A small mascot sits at a tiny desk with a glowing laptop"));
    assert.ok(result.includes("soft warm yellow"));
    assert.ok(!result.includes("[SCENE]"));
    assert.ok(!result.includes("[BACKGROUND]"));
  });

  it("strips trailing period from scene description", () => {
    const result = buildFullPrompt("Mascot next to a server rack.", "navy");
    assert.ok(result.includes("Mascot next to a server rack."));
    // The period before the template's own period should be stripped
    assert.ok(!result.includes("rack.."));
  });

  it("falls back to white when background ID is unknown", () => {
    const result = buildFullPrompt("A scene", "nonexistent");
    assert.ok(result.includes("pure white"));
  });
});

describe("resolveImagePath", () => {
  it("resolves shorthand to output directory", () => {
    const result = resolveImagePath("12518", "2a");
    assert.equal(result, path.join(OUTPUT_DIR, "12518", "prompt-2a.png"));
  });

  it("returns absolute path as-is", () => {
    const result = resolveImagePath("12518", "/tmp/custom.png");
    assert.equal(result, "/tmp/custom.png");
  });

  it("resolves relative path to absolute", () => {
    const result = resolveImagePath("12518", "some/image.png");
    assert.equal(result, path.resolve("some/image.png"));
  });
});

describe("prompt structure validation", () => {
  it("validates a correct prompt result", () => {
    const sceneDescription = "A small mascot from the reference image sits at a desk in the foreground, facing a laptop screen with code visible on it";
    const buildPrompt = (scene: string, bg: string) =>
      PROMPT_TEMPLATE.replace("[SCENE]", scene).replace("[BACKGROUND]", bg);

    const result = {
      prompts: [
        {
          scene: "mascot and robot at desk",
          mascot: "miner",
          background: "cream",
          scene_description: sceneDescription,
          full_prompt: buildPrompt(sceneDescription, "soft warm yellow"),
        },
        {
          scene: "mascot next to server rack",
          mascot: "hat",
          background: "navy",
          scene_description: "A small mascot from the reference image stands next to a server rack in the midground, with blinking lights in the background",
          full_prompt: buildPrompt("A small mascot from the reference image stands next to a server rack in the midground, with blinking lights in the background", "deep navy blue"),
        },
      ],
    };

    assert.ok(Array.isArray(result.prompts));
    assert.ok(result.prompts.length >= 2 && result.prompts.length <= 3);

    for (const p of result.prompts) {
      assert.ok(typeof p.scene === "string" && p.scene.length > 0);
      assert.ok(typeof p.mascot === "string" && (p.mascot === "miner" || p.mascot === "hat"));
      assert.ok(typeof p.background === "string" && p.background in BACKGROUND_COLORS);
      assert.ok(typeof p.scene_description === "string" && p.scene_description.length > 0);
      assert.ok(typeof p.full_prompt === "string");
      assert.ok(p.full_prompt.startsWith("Isometric 3D"));
      assert.ok(p.full_prompt.includes("Lock angle and position"));
      assert.ok(!p.full_prompt.includes("[SCENE]"));
      assert.ok(!p.full_prompt.includes("[BACKGROUND]"));
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

describe("generateWorkflow", () => {
  it("throws on invalid model", async () => {
    await assert.rejects(
      () => generateWorkflow({ postId: "123", model: "gpt4" as any, wide: true }),
      { message: /Unknown model "gpt4"/ },
    );
  });
});

describe("pickWorkflow", () => {
  it("throws when file does not exist", async () => {
    await assert.rejects(
      () => pickWorkflow({ postId: "123", imagePath: "/nonexistent/image.png" }),
      { message: /Image not found: \/nonexistent\/image\.png/ },
    );
  });
});

describe("Ed25519 signature verification", () => {
  async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const pubHex = Buffer.from(rawPub).toString("hex");
    return { keyPair, pubHex };
  }

  it("rejects an invalid signature", async () => {
    const { pubHex } = await generateKeyPair();
    const badSig = "00".repeat(64);
    const result = await verifySignature("body", badSig, "1234567890", pubHex);
    assert.equal(result, false);
  });

  it("accepts a valid signature", async () => {
    const { keyPair, pubHex } = await generateKeyPair();
    const timestamp = "1234567890";
    const body = '{"type":1}';
    const message = new TextEncoder().encode(timestamp + body);
    const sig = await crypto.subtle.sign("Ed25519", keyPair.privateKey, message);
    const sigHex = Buffer.from(sig).toString("hex");

    const result = await verifySignature(body, sigHex, timestamp, pubHex);
    assert.equal(result, true);
  });
});
