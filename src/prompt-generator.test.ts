import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFullPrompt } from "./prompt-generator.ts";
import { PROMPT_TEMPLATE, BACKGROUND_COLORS } from "./config.ts";

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
        {
          scene: "mascot building a bridge",
          mascot: "miner",
          background: "mint",
          scene_description: "A small mascot from the reference image hammers wooden planks on a half-built bridge in the foreground, a river flowing below",
          full_prompt: buildPrompt("A small mascot from the reference image hammers wooden planks on a half-built bridge in the foreground, a river flowing below", "soft mint green"),
        },
        {
          scene: "mascot reading a map",
          mascot: "hat",
          background: "sky",
          scene_description: "A small mascot from the reference image holds open a large treasure map in the foreground, a winding path stretching into the background",
          full_prompt: buildPrompt("A small mascot from the reference image holds open a large treasure map in the foreground, a winding path stretching into the background", "soft sky blue"),
        },
        {
          scene: "gears and conveyor belt",
          mascot: "none",
          background: "slate",
          scene_description: "Interlocking gears drive a conveyor belt carrying glowing data packets across the midground, steam rising from pipes in the background",
          full_prompt: buildPrompt("Interlocking gears drive a conveyor belt carrying glowing data packets across the midground, steam rising from pipes in the background", "dark charcoal"),
        },
      ],
    };

    assert.ok(Array.isArray(result.prompts));
    assert.ok(result.prompts.length === 5);

    for (const p of result.prompts) {
      assert.ok(typeof p.scene === "string" && p.scene.length > 0);
      assert.ok(typeof p.mascot === "string" && (p.mascot === "miner" || p.mascot === "hat" || p.mascot === "none"));
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
