import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..");

export const config = {
  wpUrl: process.env.WP_URL || "https://blog.codeminer42.com",
  wpUsername: process.env.WP_USERNAME || "",
  wpAppPassword: process.env.WP_APP_PASSWORD || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  runpodQwenUrl: process.env.RUNPOD_QWEN_URL || "",
} as const;

export const MASCOT_PATHS = {
  mascot1: path.join(PROJECT_ROOT, "mascots", "mascot-1.png"),
  mascot2: path.join(PROJECT_ROOT, "mascots", "mascot-2.png"),
} as const;

export const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");

export const STYLE_TEMPLATE = `Isometric 3D illustration on a pure white background.
Wide establishing shot, zoomed out to show the full scene from a distance.
Pixar-style 3D render with clean, minimal shadows.
Centered composition, 16:9 aspect ratio.
Two robot mascots (reference image 1 and reference image 2)`;
