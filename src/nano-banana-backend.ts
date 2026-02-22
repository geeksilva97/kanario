import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import { config } from "./config.ts";
import type { ImageBackend } from "./image-backend.ts";

const MAX_RETRIES = 6;
const INITIAL_BACKOFF_MS = 5_000;

function isRateLimitError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return text.includes("429") || text.includes("RESOURCE_EXHAUSTED");
}

export function createNanoBananaBackend(): ImageBackend {
  return {
    maxConcurrency: 1,
    async generate({ prompt, mascotPath, seed, wide }) {
      const ai = new GoogleGenAI({ vertexai: true, apiKey: config.geminiApiKey });
      const mascotBase64 = fs.readFileSync(mascotPath).toString("base64");

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`    Generating via Nano Banana (Gemini 2.5 Flash Image) ...`);
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { data: mascotBase64, mimeType: "image/png" } },
                  { text: prompt },
                ],
              },
            ],
            config: {
              responseModalities: ["IMAGE"],
              ...(wide && { imageConfig: { aspectRatio: "16:9" } }),
            },
          });

          const imagePart = response.candidates?.[0]?.content?.parts?.find(
            (p: any) => p.inlineData,
          );
          if (!imagePart?.inlineData?.data) {
            throw new Error("Nano Banana returned no image data");
          }
          console.log(`    Received image from Nano Banana`);
          return Buffer.from(imagePart.inlineData.data, "base64");
        } catch (err) {
          if (isRateLimitError(err) && attempt < MAX_RETRIES) {
            const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
            console.log(`    Rate limited, retrying in ${(backoff / 1000).toFixed(0)}s (attempt ${attempt + 1}/${MAX_RETRIES}) ...`);
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }
          throw err;
        }
      }

      throw new Error("Nano Banana: exhausted all retries");
    },
  };
}
