import { GoogleGenAI, Type } from "@google/genai";
import { config } from "./config.ts";
import {
  type PromptResult,
  SYSTEM_PROMPT,
  mapRawPrompts,
} from "./prompt-generator.ts";
import {
  SCHEMA_DESCRIPTIONS,
  MASCOT_CHOICES,
  BACKGROUND_CHOICES,
  buildUserMessage,
  sanitizeJsonResponse,
  type RawPrompt,
} from "./prompt-schema.ts";
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
            description: SCHEMA_DESCRIPTIONS.scene,
          },
          mascot: {
            type: Type.STRING,
            enum: [...MASCOT_CHOICES],
            description: SCHEMA_DESCRIPTIONS.mascot,
          },
          background: {
            type: Type.STRING,
            enum: [...BACKGROUND_CHOICES],
            description: SCHEMA_DESCRIPTIONS.background,
          },
          scene_description: {
            type: Type.STRING,
            description: SCHEMA_DESCRIPTIONS.scene_description,
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

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: buildUserMessage(post, hint),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: promptSchema,
    },
  });

  // JSON.parse returns unknown — shape is guaranteed by responseSchema above
  const raw = JSON.parse(sanitizeJsonResponse(response.text!)) as {
    prompts: RawPrompt[];
  };

  return { prompts: mapRawPrompts(raw) };
}
