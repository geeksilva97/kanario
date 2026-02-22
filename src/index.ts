import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    hint: { type: "string" },
    prompt: { type: "string" },
    model: { type: "string", default: "gemini" },
    "image-model": { type: "string", default: "qwen" },
    output: { type: "string", short: "o" },
    wide: { type: "boolean", default: true },
    "no-wide": { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`Usage:
  ./kanario <post-id-or-url> [options]       Generate thumbnails
  ./kanario pick <post-id-or-url> <image>    Upload & set featured image
  ./kanario improve <post-id> <image> --prompt "..."  Iterate on an existing image

Fetches a WordPress draft, generates thumbnail prompts via an LLM,
and produces cover images via an image backend (Qwen on RunPod or Nano Banana on Vertex AI).

Arguments:
  post-id-or-url  WordPress post ID or wp-admin edit URL
  <image>         Shorthand (e.g. "2") or full path to a PNG

Options:
  --model        LLM for prompt generation: "gemini" (default) or "claude"
  --image-model  Image backend: "qwen" (default) or "nano-banana"
  -o, --output   Custom output directory (default: output/<post-id>)
  --no-wide      Disable 16:9 padding, output matches mascot aspect ratio (square)
  --hint         Guide the visual metaphor (e.g. "two models competing side by side")
  --prompt       Improvement instructions for the improve command
  -h, --help     Show this help

Examples:
  ./kanario 12487
  ./kanario 12487 --no-wide
  ./kanario 12487 --model claude
  ./kanario 12487 --image-model nano-banana
  ./kanario 12487 --hint "versus scene, two robots facing off"
  ./kanario pick 12487 2
  ./kanario pick 12487 /path/to/custom.png
  ./kanario improve 12487 2 --prompt "make the background darker"`);
  process.exit(0);
}

if (positionals[0] === "pick") {
  const { pick } = await import("./commands/pick.ts");
  await pick(positionals);
} else if (positionals[0] === "improve") {
  const { improve } = await import("./commands/improve.ts");
  await improve(positionals, values);
} else {
  const { generate } = await import("./commands/generate.ts");
  await generate(positionals, values);
}
