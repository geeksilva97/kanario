import fs from "node:fs";
import path from "node:path";
import { config, OUTPUT_DIR, MASCOTS, type MascotId } from "../config.ts";
import { fetchDraft } from "../wordpress.ts";
import { generatePrompts as claudeGeneratePrompts, type ImagePrompt } from "../prompt-generator.ts";
import { generatePrompts as geminiGeneratePrompts } from "../gemini-generator.ts";
import { generateSingleImage, createImageBackend } from "../image-generator.ts";
import type { ImageModel } from "../image-backend.ts";

export interface GenerateOptions {
  postId: string;
  model: "gemini" | "claude";
  imageModel?: ImageModel;
  outputDir?: string;
  wide: boolean;
  hint?: string;
}

export interface GenerateResult {
  postTitle: string;
  prompts: ImagePrompt[];
  imagePaths: string[];
  outputDir: string;
}

export async function generateWorkflow(
  options: GenerateOptions,
  onProgress?: (msg: string) => void,
): Promise<GenerateResult> {
  const { postId, model, imageModel = "qwen", outputDir: customOutputDir, wide, hint } = options;
  const log = onProgress ?? (() => {});

  if (model !== "claude" && model !== "gemini") {
    throw new Error(`Unknown model "${model}". Choose "claude" or "gemini".`);
  }

  // Validate required config
  const missing: string[] = [];
  if (!config.wpUsername) missing.push("WP_USERNAME");
  if (!config.wpAppPassword) missing.push("WP_APP_PASSWORD");
  if (model === "claude" && !config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY");
  if (model === "gemini" && !config.geminiApiKey) missing.push("GEMINI_API_KEY");
  if (imageModel === "nano-banana" && !config.geminiApiKey) missing.push("GEMINI_API_KEY");
  if (imageModel === "qwen" && !config.runpodApiKey) missing.push("RUNPOD_API_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  const backend = createImageBackend(imageModel);

  const generatePrompts = model === "gemini" ? geminiGeneratePrompts : claudeGeneratePrompts;

  // Step 1: Fetch WordPress draft
  log(`[1/4] Fetching post ${postId} from ${config.wpUrl} ...`);
  const post = await fetchDraft(postId);
  log(`  Title: ${post.title}`);
  log(`  Content length: ${post.content.length} chars`);

  // Step 2: Generate image prompts via LLM
  const modelLabel = model === "gemini" ? "Gemini" : "Claude";
  log(`[2/4] Generating image prompts via ${modelLabel} ...`);
  if (hint) log(`  Hint: "${hint}"`);
  const result = await generatePrompts(post, hint);
  log(`  Generated ${result.prompts.length} prompts:`);
  for (const [i, p] of result.prompts.entries()) {
    log(`  ${i + 1}. ${p.scene}`);
  }

  // Step 3: Generate images
  const imageLabel = imageModel === "nano-banana" ? "Nano Banana" : "Qwen Image Edit";
  log(`[3/4] Generating images via ${imageLabel} (${wide ? "wide" : "square"}) ...`);
  const outputDir = customOutputDir ? path.resolve(customOutputDir) : path.join(OUTPUT_DIR, postId);

  const jobs = result.prompts.map((prompt, i) => {
    const mascotId = (prompt.mascot in MASCOTS ? prompt.mascot : "miner") as MascotId;
    return {
      prompt: prompt.full_prompt,
      mascotPath: MASCOTS[mascotId],
      outputDir,
      filename: `prompt-${i + 1}.png`,
      seed: Math.floor(Math.random() * 2 ** 32),
      wide,
      label: `Prompt ${i + 1}: ${prompt.scene} (mascot: ${mascotId})`,
    };
  });

  for (const job of jobs) {
    log(`  ${job.label}`);
  }

  const concurrency = backend.maxConcurrency ?? jobs.length;
  log(`  Submitting ${jobs.length} jobs (concurrency: ${concurrency}) ...`);
  const imagePaths = await mapWithConcurrency(
    jobs,
    ({ label, ...opts }) => generateSingleImage(opts, backend),
    concurrency,
  );

  // Step 4: Save prompts.json
  log(`[4/4] Saving metadata ...`);
  const metadata = {
    post_title: post.title,
    generated_at: new Date().toISOString(),
    prompts: result.prompts,
  };
  const metadataPath = path.join(outputDir, "prompts.json");
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  log(`  Saved ${metadataPath}`);

  return {
    postTitle: post.title,
    prompts: result.prompts,
    imagePaths,
    outputDir,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
