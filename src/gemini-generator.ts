import { GoogleGenAI, Type } from "@google/genai";
import { config } from "./config.ts";
import {
  type ImagePrompt,
  type PromptResult,
  buildFullPrompt,
  SYSTEM_PROMPT,
} from "./prompt-generator.ts";
import type { WPPost } from "./wordpress.ts";

const promptSchema = {
  type: Type.OBJECT,
  properties: {
    prompts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          scene: {
            type: Type.STRING,
            description:
              "Short label for the scene (2-5 words, e.g. 'mascot and robot at desk')",
          },
          mascot: {
            type: Type.STRING,
            enum: ["miner", "hat", "none"],
            description:
              "Which mascot to use: 'miner' (rugged), 'hat' (intellectual), or 'none' (scene-only, no character)",
          },
          background: {
            type: Type.STRING,
            enum: ["white", "cream", "mint", "sky", "slate", "forest", "navy", "plum"],
            description: "Background color that sets the mood for the scene",
          },
          scene_description: {
            type: Type.STRING,
            description:
              "2-3 sentences (under 60 words). When mascot is 'miner' or 'hat', place the mascot and props in a scene with camera-relative depth using 'the mascot from the reference image'. Use 'a cute round-bodied bot buddy with big eyes and a small antenna' for secondary characters (never 'robot'). When mascot is 'none', start with 'Ignore the reference image.' then describe only the scene and props — no characters.",
          },
        },
        required: ["scene", "mascot", "background", "scene_description"],
      },
    },
  },
  required: ["prompts"],
};

export async function generatePrompts(post: WPPost, hint?: string): Promise<PromptResult> {
  const ai = new GoogleGenAI({
    vertexai: true,
    apiKey: config.geminiApiKey,
  });

  const userMessage = `Generate thumbnail prompts for this blog post.

## Title (derive your core metaphor from this)
${post.title}

## Excerpt
${post.excerpt}

## Content (supporting detail only — don't let it override the title's story)
${post.content.slice(0, 4000)}${hint ? `\n\nCreative direction from the author: ${hint}` : ""}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: userMessage,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: promptSchema,
    },
  });

  const raw = JSON.parse(response.text!) as {
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
