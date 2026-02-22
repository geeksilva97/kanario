import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.ts";
import type { WPPost } from "./wordpress.ts";

const SYSTEM_PROMPT = `Extract the key points from this blog post for a creative director designing cover thumbnails. Focus on:
- The core thesis or claim
- The key mechanism or insight
- 3-5 supporting highlights

Be concise — under 300 words.`;

export async function summarizePost(
  post: WPPost,
  model: "gemini" | "claude",
): Promise<string> {
  const userMessage = `# ${post.title}

${post.content}`;

  if (model === "gemini") {
    return summarizeWithGemini(userMessage);
  }
  return summarizeWithClaude(userMessage);
}

async function summarizeWithGemini(userMessage: string): Promise<string> {
  const ai = new GoogleGenAI({
    vertexai: true,
    apiKey: config.geminiApiKey,
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userMessage,
    config: {
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  return response.text!.trim();
}

async function summarizeWithClaude(userMessage: string): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey || undefined });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude did not return a text block");
  }

  return textBlock.text.trim();
}
