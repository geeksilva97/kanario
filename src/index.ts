import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { config, OUTPUT_DIR } from "./config.ts";
import { fetchDraft, parsePostId } from "./wordpress.ts";
import { generatePrompts } from "./prompt-generator.ts";
import { generateImages } from "./image-generator.ts";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`Usage: ./kanario <post-id-or-url>

Fetches a WordPress draft, generates thumbnail prompts via Claude,
and produces cover images via Qwen Image Edit on RunPod.

Arguments:
  post-id-or-url  WordPress post ID or wp-admin edit URL

Examples:
  ./kanario 12487
  ./kanario "https://blog.codeminer42.com/wp-admin/post.php?post=12487&action=edit"

Options:
  -h, --help  Show this help`);
  process.exit(0);
}

const postId = parsePostId(positionals[0]);

// Validate required config
const missing: string[] = [];
if (!config.wpUsername) missing.push("WP_USERNAME");
if (!config.wpAppPassword) missing.push("WP_APP_PASSWORD");
if (!config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY");
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

// Step 2: Generate image prompts via Claude
console.log(`\n[2/4] Generating image prompts via Claude ...`);
const result = await generatePrompts(post);
console.log(`  Generated ${result.prompts.length} prompts:`);
for (const [i, p] of result.prompts.entries()) {
  console.log(`  ${i + 1}. ${p.scene}`);
}

// Step 3: Generate images via Qwen on RunPod
console.log(`\n[3/4] Generating images via Qwen Image Edit ...`);
const outputDir = path.join(OUTPUT_DIR, postId);
const allPaths: string[] = [];

for (const [i, prompt] of result.prompts.entries()) {
  console.log(`\n  Prompt ${i + 1}: ${prompt.scene}`);
  const paths = await generateImages({
    prompt: prompt.full_prompt,
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
