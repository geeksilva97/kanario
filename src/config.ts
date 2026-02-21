import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..");

export const config = {
  wpUrl: process.env.WP_URL || "https://blog.codeminer42.com",
  wpUsername: process.env.WP_USERNAME || "",
  wpAppPassword: process.env.WP_APP_PASSWORD || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  runpodApiKey: process.env.RUNPOD_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  discordToken: process.env.DISCORD_TOKEN || "",
  discordPublicKey: process.env.DISCORD_PUBLIC_KEY || "",
  discordApplicationId: process.env.DISCORD_APPLICATION_ID || "",
} as const;

export const MASCOTS = {
  miner: path.join(PROJECT_ROOT, "mascots", "mascot3d.png"),
  hat: path.join(PROJECT_ROOT, "mascots", "mascot-hat.png"),
} as const;

export type MascotId = keyof typeof MASCOTS;

export const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");

export const BACKGROUND_COLORS = {
  white:  { hex: "#ffffff", prompt: "pure white" },
  cream:  { hex: "#fff7c9", prompt: "soft warm yellow" },
  mint:   { hex: "#d5f3d7", prompt: "soft mint green" },
  sky:    { hex: "#c8eeff", prompt: "soft sky blue" },
  slate:  { hex: "#1a1a1a", prompt: "dark charcoal" },
  forest: { hex: "#183e1f", prompt: "deep forest green" },
  navy:   { hex: "#042c3e", prompt: "deep navy blue" },
  plum:   { hex: "#4c154c", prompt: "deep plum purple" },
} as const;

export type BackgroundId = keyof typeof BACKGROUND_COLORS;

export const PROMPTS_DIR = path.join(PROJECT_ROOT, "prompts");

export const PROMPT_TEMPLATE = fs.readFileSync(path.join(PROMPTS_DIR, "image-style.md"), "utf-8").trim();
