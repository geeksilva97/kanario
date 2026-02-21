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
} as const;

export const MASCOTS = {
  miner: path.join(PROJECT_ROOT, "mascots", "mascot3d.png"),
  hat: path.join(PROJECT_ROOT, "mascots", "mascot-hat.png"),
} as const;

export type MascotId = keyof typeof MASCOTS;

export const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");

export const PROMPT_TEMPLATE = `Isometric 3D scene, Pixar-style render, pure white background, clean minimal shadows. Wide establishing shot, zoomed out so the entire scene is a small diorama occupying only the center of the frame. [SCENE]. Lock angle and position. The scene is tiny and centered, surrounded by vast empty background on all sides, 16:9 widescreen format.`;
