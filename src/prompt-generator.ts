import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config, PROMPT_TEMPLATE, PROMPTS_DIR, BACKGROUND_COLORS, type BackgroundId } from "./config.ts";
import type { WPPost } from "./wordpress.ts";

export interface ImagePrompt {
  scene: string;
  mascot: string;
  background: string;
  scene_description: string;
  full_prompt: string;
}

export interface PromptResult {
  prompts: ImagePrompt[];
}

export const SYSTEM_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "system.md"), "utf-8").trim();

export function buildFullPrompt(sceneDescription: string, backgroundId: string): string {
  const scene = sceneDescription.replace(/\.$/, "");
  const bg = (backgroundId in BACKGROUND_COLORS
    ? BACKGROUND_COLORS[backgroundId as BackgroundId]
    : BACKGROUND_COLORS.white
  ).prompt;
  return PROMPT_TEMPLATE.replace("[SCENE]", scene).replace("[BACKGROUND]", bg);
}

export async function generatePrompts(post: WPPost, hint?: string): Promise<PromptResult> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "generate_prompts",
        description:
          "Generate image prompts for blog cover thumbnails based on the post content.",
        input_schema: {
          type: "object" as const,
          properties: {
            prompts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  scene: {
                    type: "string",
                    description:
                      "Short label for the scene (2-5 words, e.g. 'mascot and robot at desk')",
                  },
                  mascot: {
                    type: "string",
                    enum: ["miner", "hat"],
                    description:
                      "Which mascot to use: 'miner' (rugged) or 'hat' (intellectual)",
                  },
                  background: {
                    type: "string",
                    enum: ["white", "cream", "mint", "sky", "slate", "forest", "navy", "plum"],
                    description:
                      "Background color that sets the mood for the scene",
                  },
                  scene_description: {
                    type: "string",
                    description:
                      "2-3 sentences (under 40 words). Place the mascot and props in a scene with camera-relative depth. Use 'a small mascot from the reference image'. Don't prescribe poses.",
                  },
                },
                required: ["scene", "mascot", "background", "scene_description"],
              },
              minItems: 2,
              maxItems: 3,
            },
          },
          required: ["prompts"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "generate_prompts" },
    messages: [
      {
        role: "user",
        content: `Generate thumbnail prompts for this blog post:

Title: ${post.title}

Excerpt: ${post.excerpt}

Content:
${post.content.slice(0, 4000)}${hint ? `\n\nCreative direction from the author: ${hint}` : ""}`,
      },
    ],
  });

  const toolBlock = message.content.find((block) => block.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block");
  }

  const raw = toolBlock.input as {
    prompts: Array<{
      scene: string;
      mascot: string;
      background: string;
      scene_description: string;
    }>;
  };

  return {
    prompts: raw.prompts.map((p) => ({
      ...p,
      full_prompt: buildFullPrompt(p.scene_description, p.background),
    })),
  };
}
