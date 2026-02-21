import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";

export interface GenerateImageOptions {
  prompt: string;
  mascot1Path: string;
  mascot2Path: string;
  outputDir: string;
  filenamePrefix: string;
  width?: number;
  height?: number;
}

async function generateSingle(
  prompt: string,
  mascot1Path: string,
  mascot2Path: string,
  seed: number,
  width: number,
  height: number,
): Promise<Buffer> {
  const mascot1 = fs.readFileSync(mascot1Path);
  const mascot2 = fs.readFileSync(mascot2Path);

  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append(
    "reference_image_1",
    new Blob([mascot1], { type: "image/png" }),
    "mascot-1.png",
  );
  formData.append(
    "reference_image_2",
    new Blob([mascot2], { type: "image/png" }),
    "mascot-2.png",
  );
  formData.append("seed", String(seed));
  formData.append("width", String(width));
  formData.append("height", String(height));

  const url = `${config.runpodQwenUrl}/generate`;
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qwen server error ${response.status}: ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateImages(
  options: GenerateImageOptions,
): Promise<string[]> {
  const {
    prompt,
    mascot1Path,
    mascot2Path,
    outputDir,
    filenamePrefix,
    width = 1280,
    height = 720,
  } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  const seeds = [
    Math.floor(Math.random() * 2 ** 32),
    Math.floor(Math.random() * 2 ** 32),
  ];

  const suffixes = ["a", "b"];
  const savedPaths: string[] = [];

  for (let i = 0; i < 2; i++) {
    const filename = `${filenamePrefix}${suffixes[i]}.png`;
    const outputPath = path.join(outputDir, filename);

    console.log(`  Generating ${filename} (seed: ${seeds[i]}) ...`);

    const pngBuffer = await generateSingle(
      prompt,
      mascot1Path,
      mascot2Path,
      seeds[i],
      width,
      height,
    );

    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`  Saved ${filename} (${(pngBuffer.length / 1024).toFixed(0)} KB)`);

    savedPaths.push(outputPath);
  }

  return savedPaths;
}
