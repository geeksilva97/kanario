export const MASCOT_CHOICES = ["miner", "hat", "none"] as const;
export type MascotChoice = (typeof MASCOT_CHOICES)[number];

export const BACKGROUND_CHOICES = ["white", "cream", "mint", "sky", "slate", "forest", "navy", "plum"] as const;
export type BackgroundChoice = (typeof BACKGROUND_CHOICES)[number];

export const SCHEMA_DESCRIPTIONS = {
  scene: "Short label for the scene (2-5 words, e.g. 'mascot and robot at desk')",
  mascot: "Which mascot to use: 'miner' (rugged), 'hat' (intellectual), or 'none' (scene-only, no character)",
  background: "Background color that sets the mood for the scene",
  scene_description: "2-3 sentences (under 60 words). When mascot is 'miner' or 'hat', place the mascot and props in a scene with camera-relative depth using 'the mascot from the reference image'. Use 'a cute round-bodied bot buddy with big eyes and a small antenna' for secondary characters (never 'robot'). When mascot is 'none', start with 'Ignore the reference image.' then describe only the scene and props — no characters.",
} as const;

export type RawPrompt = {
  scene: string;
  mascot: string;
  background: string;
  scene_description: string;
};

export function buildUserMessage(post: { title: string; summary?: string; content: string }, hint?: string): string {
  return `Generate thumbnail prompts for this blog post.

## Title (derive your core metaphor from this)
${post.title}

## Key points (summarized from the full article)
${post.summary ?? post.content.slice(0, 4000)}${hint ? `\n\nCreative direction from the author: ${hint}` : ""}`;
}

export function sanitizeJsonResponse(text: string): string {
  return text.replace(/^```json\s*/, "").replace(/```$/, "").trim();
}
