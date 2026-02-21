import fs from "node:fs";
import path from "node:path";
import { config, OUTPUT_DIR, MASCOTS, type MascotId } from "../config.ts";
import { fetchDraft, parsePostId } from "../wordpress.ts";
import { generatePrompts as claudeGeneratePrompts } from "../prompt-generator.ts";
import { generatePrompts as geminiGeneratePrompts } from "../gemini-generator.ts";
import { generateSingleImage } from "../image-generator.ts";

export async function generate(
  positionals: string[],
  values: { hint?: string; model?: string; wide?: boolean; "no-wide"?: boolean },
) {
  const postId = parsePostId(positionals[0]);
  const hint = values.hint;
  const modelChoice = values.model as string;
  const wide = values["no-wide"] ? false : (values.wide as boolean);

  if (modelChoice !== "claude" && modelChoice !== "gemini") {
    console.error(`Unknown model "${modelChoice}". Choose "claude" or "gemini".`);
    process.exit(1);
  }

  const generatePrompts = modelChoice === "gemini" ? geminiGeneratePrompts : claudeGeneratePrompts;

  // Validate required config
  const missing: string[] = [];
  if (!config.wpUsername) missing.push("WP_USERNAME");
  if (!config.wpAppPassword) missing.push("WP_APP_PASSWORD");
  if (modelChoice === "claude" && !config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY");
  if (modelChoice === "gemini" && !config.geminiApiKey) missing.push("GEMINI_API_KEY");
  if (!config.runpodApiKey) missing.push("RUNPOD_API_KEY");
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(", ")}`);
    console.error("Copy .env.example to .env and fill in the values.");
    process.exit(1);
  }

  // Step 1: Fetch WordPress draft
  console.log(`\n[1/4] Fetching post ${postId} from ${config.wpUrl} ...`);
  const post = await fetchDraft(postId);
  console.log(`  Title: ${post.title}`);
  console.log(`  Content length: ${post.content.length} chars`);

  // Step 2: Generate image prompts via LLM
  const modelLabel = modelChoice === "gemini" ? "Gemini" : "Claude";
  console.log(`\n[2/4] Generating image prompts via ${modelLabel} ...`);
  if (hint) console.log(`  Hint: "${hint}"`);
  const result = await generatePrompts(post, hint);
  console.log(`  Generated ${result.prompts.length} prompts:`);
  for (const [i, p] of result.prompts.entries()) {
    console.log(`  ${i + 1}. ${p.scene}`);
  }

  // Step 3: Generate images via Qwen on RunPod
  console.log(`\n[3/4] Generating images via Qwen Image Edit (${wide ? "wide" : "square"}) ...`);
  const outputDir = path.join(OUTPUT_DIR, postId);

  const suffixes = ["a", "b"];
  const jobs = result.prompts.flatMap((prompt, i) => {
    const mascotId = (prompt.mascot in MASCOTS ? prompt.mascot : "miner") as MascotId;
    return suffixes.map((suffix) => ({
      prompt: prompt.full_prompt,
      mascotPath: MASCOTS[mascotId],
      outputDir,
      filename: `prompt-${i + 1}${suffix}.png`,
      seed: Math.floor(Math.random() * 2 ** 32),
      wide,
      label: `Prompt ${i + 1}${suffix}: ${prompt.scene} (mascot: ${mascotId})`,
    }));
  });

  for (const job of jobs) {
    console.log(`  ${job.label}`);
  }

  console.log(`\n  Submitting ${jobs.length} jobs in parallel ...`);
  const allPaths = await Promise.all(
    jobs.map(({ label, ...opts }) => generateSingleImage(opts)),
  );

  // Step 4: Save prompts.json
  console.log(`\n[4/4] Saving metadata ...`);
  const metadata = {
    post_title: post.title,
    generated_at: new Date().toISOString(),
    prompts: result.prompts,
  };
  const metadataPath = path.join(outputDir, "prompts.json");
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`  Saved ${metadataPath}`);

  console.log(`\nDone! Generated ${allPaths.length} images in ${outputDir}`);
  process.exit(0);
}
