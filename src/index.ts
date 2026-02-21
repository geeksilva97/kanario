import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { config, OUTPUT_DIR, MASCOTS, type MascotId } from "./config.ts";
import { fetchDraft, parsePostId } from "./wordpress.ts";
import { generatePrompts as claudeGeneratePrompts } from "./prompt-generator.ts";
import { generatePrompts as geminiGeneratePrompts } from "./gemini-generator.ts";
import { generateImages } from "./image-generator.ts";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    hint: { type: "string" },
    model: { type: "string", default: "gemini" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`Usage: ./kanario <post-id-or-url> [--model claude|gemini] [--hint <text>]

Fetches a WordPress draft, generates thumbnail prompts via an LLM,
and produces cover images via Qwen Image Edit on RunPod.

Arguments:
  post-id-or-url  WordPress post ID or wp-admin edit URL

Options:
  --model     LLM for prompt generation: "gemini" (default) or "claude"
  --hint      Guide the visual metaphor (e.g. "two models competing side by side")
  -h, --help  Show this help

Examples:
  ./kanario 12487
  ./kanario 12487 --model gemini
  ./kanario 12487 --hint "versus scene, two robots facing off"
  ./kanario "https://blog.codeminer42.com/wp-admin/post.php?post=12487&action=edit"`);
  process.exit(0);
}

const postId = parsePostId(positionals[0]);
const hint = values.hint;
const modelChoice = values.model as string;

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
console.log(`\n[3/4] Generating images via Qwen Image Edit ...`);
const outputDir = path.join(OUTPUT_DIR, postId);
const allPaths: string[] = [];

for (const [i, prompt] of result.prompts.entries()) {
  const mascotId = (prompt.mascot in MASCOTS ? prompt.mascot : "miner") as MascotId;
  console.log(`\n  Prompt ${i + 1}: ${prompt.scene} (mascot: ${mascotId}, bg: ${prompt.background})`);
  const paths = await generateImages({
    prompt: prompt.full_prompt,
    mascotPath: MASCOTS[mascotId],
    outputDir,
    filenamePrefix: `prompt-${i + 1}`,
  });
  allPaths.push(...paths);
}

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
