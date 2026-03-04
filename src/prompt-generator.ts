import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config, PROMPT_TEMPLATE, PROMPTS_DIR, BACKGROUND_COLORS, MODELS } from "./config.ts";
import type { WPPost } from "./wordpress.ts";
import {
  SCHEMA_DESCRIPTIONS,
  MASCOT_CHOICES,
  BACKGROUND_CHOICES,
  buildUserMessage,
  type RawPrompt,
} from "./prompt-schema.ts";
import { isBackgroundId } from "./utils/type-guards.ts";

export interface ImagePrompt extends RawPrompt {
  full_prompt: string;
}

export interface PromptResult {
  prompts: ImagePrompt[];
}

export const SYSTEM_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "system.md"), "utf-8").trim();

export function buildFullPrompt(sceneDescription: string, backgroundId: string): string {
  const scene = sceneDescription.replace(/\.$/, "");
  const bg = (isBackgroundId(backgroundId) ? BACKGROUND_COLORS[backgroundId] : BACKGROUND_COLORS.white).prompt;
  return PROMPT_TEMPLATE.replace("[SCENE]", scene).replace("[BACKGROUND]", bg);
}

export function mapRawPrompts(raw: { prompts: RawPrompt[] }): ImagePrompt[] {
  return raw.prompts.map((p) => ({
    ...p,
    full_prompt: buildFullPrompt(p.scene_description, p.background),
  }));
}

export async function generatePrompts(post: WPPost, hint?: string): Promise<PromptResult> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const message = await client.messages.create({
    model: MODELS.claudePrompt,
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
                    description: SCHEMA_DESCRIPTIONS.scene,
                  },
                  mascot: {
                    type: "string",
                    enum: [...MASCOT_CHOICES],
                    description: SCHEMA_DESCRIPTIONS.mascot,
                  },
                  background: {
                    type: "string",
                    enum: [...BACKGROUND_CHOICES],
                    description: SCHEMA_DESCRIPTIONS.background,
                  },
                  scene_description: {
                    type: "string",
                    description: SCHEMA_DESCRIPTIONS.scene_description,
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
    messages: [{ role: "user", content: buildUserMessage(post, hint) }],
  });

  const toolBlock = message.content.find((block) => block.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block");
  }

  // Anthropic SDK types toolBlock.input as unknown — shape is guaranteed by the tool schema above
  return { prompts: mapRawPrompts(toolBlock.input as { prompts: RawPrompt[] }) };
}
