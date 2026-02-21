import Anthropic from "@anthropic-ai/sdk";
import { config, STYLE_TEMPLATE } from "./config.ts";
import type { WPPost } from "./wordpress.ts";

export interface ImagePrompt {
  scene: string;
  full_prompt: string;
}

export interface PromptResult {
  prompts: ImagePrompt[];
}

const SYSTEM_PROMPT = `You are a creative director for a tech blog. Given a blog post, you generate scene descriptions for blog cover thumbnails.

Each scene must describe what two robot mascots are doing in the context of the blog post's topic. The scenes should be visually interesting, metaphorical, and capture the essence of the post.

Rules:
- Generate exactly 2-3 scenes
- Each scene should be distinct and capture a different aspect of the post
- Scenes describe physical actions/settings the mascots are in (not abstract concepts)
- Keep scene descriptions concise (1-2 sentences)
- The full_prompt must start with the locked style template and then describe the scene

Locked style template (must prefix every full_prompt):
${STYLE_TEMPLATE}`;

export async function generatePrompts(post: WPPost): Promise<PromptResult> {
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
                      "Short description of the scene (1-2 sentences)",
                  },
                  full_prompt: {
                    type: "string",
                    description:
                      "Complete image generation prompt starting with the locked style template",
                  },
                },
                required: ["scene", "full_prompt"],
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
${post.content.slice(0, 4000)}`,
      },
    ],
  });

  const toolBlock = message.content.find((block) => block.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block");
  }

  return toolBlock.input as PromptResult;
}
