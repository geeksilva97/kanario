import fsp from "node:fs/promises";
import path from "node:path";
import { config, OUTPUT_DIR, MASCOTS } from "../config.ts";
import type { HttpClient } from "../http.ts";
import { fetchDraft } from "../wordpress.ts";
import { generatePrompts as claudeGeneratePrompts, type ImagePrompt } from "../prompt-generator.ts";
import { generatePrompts as geminiGeneratePrompts } from "../gemini-generator.ts";
import { generateSingleImage, createImageBackend, encodeMascot } from "../image-generator.ts";
import { createRunpodClient } from "../qwen-backend.ts";
import { summarizePost } from "../summarizer.ts";
import type { ImageModel } from "../image-backend.ts";
import { ConfigError } from "../errors/index.ts";
import { isMascotId } from "../utils/type-guards.ts";

export interface GenerateOptions {
  wpHttp: HttpClient;
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
  const { wpHttp, postId, model, imageModel = "qwen", outputDir: customOutputDir, wide, hint } = options;
  const log = onProgress ?? (() => {});

  if (model !== "claude" && model !== "gemini") {
    throw ConfigError.unknownModel(model);
  }

  // Validate required config
  const missing: string[] = [];
  if (model === "claude" && !config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY");
  if (model === "gemini" && !config.geminiApiKey) missing.push("GEMINI_API_KEY");
  if (imageModel === "qwen" && !config.runpodApiKey) missing.push("RUNPOD_API_KEY");
  if (missing.length > 0) {
    throw ConfigError.missingEnvVars(missing);
  }

  const runpodHttp = createRunpodClient();
  const backend = createImageBackend(imageModel, runpodHttp);

  const generatePrompts = model === "gemini" ? geminiGeneratePrompts : claudeGeneratePrompts;

  // Step 1: Fetch WordPress draft
  log(`[1/5] Fetching post ${postId} from ${wpHttp.baseUrl} ...`);
  const post = await fetchDraft(wpHttp, postId);
  log(`  Title: ${post.title}`);
  log(`  Content length: ${post.content.length} chars`);

  // Step 2: Summarize post content
  const modelLabel = model === "gemini" ? "Gemini" : "Claude";
  log(`[2/5] Summarizing post via ${modelLabel} ...`);
  post.summary = await summarizePost(post, model);
  log(`  Summary: ${post.summary.length} chars`);

  // Step 3: Generate image prompts via LLM
  log(`[3/5] Generating image prompts via ${modelLabel} ...`);
  if (hint) log(`  Hint: "${hint}"`);
  const result = await generatePrompts(post, hint);
  log(`  Generated ${result.prompts.length} prompts:`);
  for (const [i, p] of result.prompts.entries()) {
    log(`  ${i + 1}. ${p.scene}`);
  }

  // Step 4: Generate images
  log(`[4/5] Generating images via Qwen Image Edit (${wide ? "wide" : "square"}) ...`);
  const outputDir = customOutputDir ? path.resolve(customOutputDir) : path.join(OUTPUT_DIR, postId);

  const jobs = result.prompts.map((prompt, i) => {
    const isNone = prompt.mascot === "none";
    const mascotId = isNone ? undefined : (isMascotId(prompt.mascot) ? prompt.mascot : "miner");
    return {
      prompt: prompt.full_prompt,
      ...(mascotId ? { mascotPath: MASCOTS[mascotId] } : {}),
      outputDir,
      filename: `prompt-${i + 1}.png`,
      seed: -1,
      wide,
      label: `Prompt ${i + 1}: ${prompt.scene} (${isNone ? "no mascot" : `mascot: ${mascotId}`})`,
    };
  });

  for (const job of jobs) {
    log(`  ${job.label}`);
  }

  // Pre-warm: create output dir + encode mascots before parallel workers start
  await fsp.mkdir(outputDir, { recursive: true });
  const uniqueMascotPaths = [...new Set(jobs.map((j) => j.mascotPath).filter(Boolean))] as string[];
  await Promise.all(uniqueMascotPaths.map((p) => encodeMascot(p, wide)));

  const concurrency = backend.maxConcurrency ?? jobs.length;
  log(`  Submitting ${jobs.length} jobs (concurrency: ${concurrency}) ...`);
  const imagesStart = Date.now();
  let completedCount = 0;
  const imagePaths = await mapWithConcurrency(
    jobs,
    ({ label, ...opts }) =>
      generateSingleImage(opts, backend).then((p) => {
        completedCount++;
        log(`  Image ${completedCount}/${jobs.length} done (${formatElapsed(Date.now() - imagesStart)})`);
        return p;
      }),
    concurrency,
  );
  log(`  All ${jobs.length} images done in ${formatElapsed(Date.now() - imagesStart)}`);

  // Step 5: Save prompts.json
  log(`[5/5] Saving metadata ...`);
  const metadata = {
    post_title: post.title,
    generated_at: new Date().toISOString(),
    prompts: result.prompts,
  };
  const metadataPath = path.join(outputDir, "prompts.json");
  await fsp.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  log(`  Saved ${metadataPath}`);

  return {
    postTitle: post.title,
    prompts: result.prompts,
    imagePaths,
    outputDir,
  };
}

function formatElapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Maps items with limited concurrency.
 * 
 * Note: This implementation relies on Node.js's single-threaded event loop.
 * The shared `nextIndex` is safe because JavaScript is single-threaded —
 * only one worker can increment the index at a time between await points.
 * Do not use this in a multi-threaded environment (e.g., worker threads)
 * without adding synchronization primitives.
 */
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
