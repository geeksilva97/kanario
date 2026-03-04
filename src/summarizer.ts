import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.ts";
import type { WPPost } from "./wordpress.ts";

const SYSTEM_PROMPT = `Extract the key points from this blog post for a creative director designing cover thumbnails. Focus on:
- The core thesis or claim
- The key mechanism or insight
- 3-5 supporting highlights

Be concise — under 300 words.`;

function isGeminiRateLimit(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  try {
    const parsed = JSON.parse(err.message);
    return parsed?.error?.code === 429 || parsed?.error?.status === "RESOURCE_EXHAUSTED";
  } catch {
    return false;
  }
}

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

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userMessage,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    return response.text!.trim();
  } catch (err) {
    if (isGeminiRateLimit(err)) {
      console.warn("Gemini rate limit hit, falling back to Claude Sonnet for summarization ...");
      return summarizeWithClaude(userMessage, "claude-sonnet-4-20250514");
    }
    throw err;
  }
}

async function summarizeWithClaude(userMessage: string, model = "claude-haiku-4-5-20251001"): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey || undefined });

  const message = await client.messages.create({
    model,
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
