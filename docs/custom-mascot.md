# Customizing or Removing the Mascot

Kanario ships with a mascot config (two character variants). The mascot is **optional per scene** — the LLM decides independently for each scene whether a character fits or a scene-only diorama works better. You can fully remove the mascot or replace it with your own images by editing 3 files. No rebuild required.

## How the mascot system works

Three control points that must stay in sync:

- **`prompts/system.md`** — the LLM's reasoning: mascot character descriptions and Qwen prompting rules per choice
- **`src/prompt-schema.ts`** — the constraint: `MASCOT_CHOICES` enum + `SCHEMA_DESCRIPTIONS.mascot` inline description
- **`src/config.ts`** — the file mapping: `MASCOTS = { miner: "...", hat: "..." }` → PNG paths

The LLM picks a mascot name from `MASCOT_CHOICES`, and `MASCOTS` maps that name to a PNG file path. Qwen receives the PNG as a reference image and the scene description as a text prompt.

## Running without any mascot

**Step 1 — `src/prompt-schema.ts`**: Change `MASCOT_CHOICES` to `["none"]`

```typescript
// Before
export const MASCOT_CHOICES = ["miner", "hat", "none"] as const;
// After
export const MASCOT_CHOICES = ["none"] as const;
```

Also simplify `SCHEMA_DESCRIPTIONS.mascot` to:

```typescript
mascot: "Always 'none' — scene-only dioramas, no character",
```

**Step 2 — `prompts/system.md`**: Remove the `## Mascot characters` table entirely. In `## Qwen prompting rules`, remove the paragraphs for `miner` and `hat` (keep only the `none` rule). Optionally update the intro paragraph to remove the mascot-choice framing.

**Step 3 — `src/config.ts`**: No changes needed. `MASCOTS` entries become unreachable but cause no errors.

**Verify**: Run `./kanario <post-id>` and confirm all 4 images have no character.

## Using your own mascot image

**Step 1** — Replace PNGs in `mascots/`. Requirements: PNG with white or transparent background, square aspect ratio, 512×512 or larger.

**Step 2 — `src/config.ts`**: Update `MASCOTS` paths to point to your new files.

```typescript
// Example
export const MASCOTS = {
  hero: "mascots/your-hero.png",
  alt: "mascots/your-alt.png",
} as const;
```

**Step 3 — `src/prompt-schema.ts`**: Update `MASCOT_CHOICES` with your new variant names, and update `SCHEMA_DESCRIPTIONS.mascot` to describe your character variants.

```typescript
export const MASCOT_CHOICES = ["hero", "alt", "none"] as const;
```

```typescript
mascot: "'hero' for action scenes, 'alt' for calm/thoughtful scenes, 'none' for scene-only dioramas",
```

**Step 4 — `prompts/system.md`**: Update the mascot characters table with your character's visual descriptions and "best for" guidance. Update the Qwen prompting rules to describe your character's visual traits (e.g. "wearing a blue jacket and red scarf" instead of "mining helmet, goggles, backpack").

## Adding a new mascot variant

1. Add a PNG to `mascots/`
2. Add the key and path to `MASCOTS` in `src/config.ts`
3. Add the name to `MASCOT_CHOICES` in `src/prompt-schema.ts`
4. Update `SCHEMA_DESCRIPTIONS.mascot` to include the new variant
5. Add a row to the mascot characters table in `prompts/system.md` with visual description and best-for guidance

## Important notes

- **`none` must always remain in `MASCOT_CHOICES`** — the Qwen backend requires this path (blank white canvas when no mascot)
- Mascot ID names are internal labels; Qwen only sees the reference PNG and scene description text
- The phrase "the mascot from the reference image" in scene descriptions is what tells Qwen to render the character from the reference PNG
