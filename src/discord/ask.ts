import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { config, MODELS } from "../config.ts";
import { isGeminiRateLimit } from "../utils/gemini.ts";
import { ASK_SYSTEM_PROMPT } from "./ask-knowledge.ts";

const MAX_RESPONSE_LENGTH = 1800;

export interface AskService {
  answer(question: string): Promise<string>;
}

export function createAskService(): AskService {
  return { answer };
}

async function answer(question: string): Promise<string> {
  try {
    return await answerWithGemini(question);
  } catch (err) {
    if (isGeminiRateLimit(err)) {
      console.warn("Gemini rate limit hit, falling back to Claude Haiku for /ask ...");
      return answerWithClaude(question);
    }
    throw err;
  }
}

async function answerWithGemini(question: string): Promise<string> {
  const ai = new GoogleGenAI({
    vertexai: true,
    apiKey: config.geminiApiKey,
  });

  const response = await ai.models.generateContent({
    model: MODELS.geminiSummarize,
    contents: question,
    config: {
      systemInstruction: ASK_SYSTEM_PROMPT,
    },
  });

  return truncate(response.text!.trim());
}

async function answerWithClaude(question: string): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey || undefined });

  const message = await client.messages.create({
    model: MODELS.claudeSummarize,
    max_tokens: 1024,
    system: ASK_SYSTEM_PROMPT,
    messages: [{ role: "user", content: question }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude did not return a text block");
  }

  return truncate(textBlock.text.trim());
}

function truncate(text: string): string {
  if (text.length <= MAX_RESPONSE_LENGTH) return text;
  return text.slice(0, MAX_RESPONSE_LENGTH - 3) + "...";
}
