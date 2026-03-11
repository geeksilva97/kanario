# Prompting Notes

Lessons learned from iterating on Qwen Image Edit prompts via kanario.

## The hint always wins

When `--hint` is provided, the LLM generates 2-3 scene prompts. Prompt 1 is consistently the best because it follows the hint almost verbatim. Prompts 2-3 drift — the model starts "interpreting" and adds its own ideas (laptops, desks, abstract concepts).

This happens because the model puts the author's literal direction first, then tries to be creative with alternatives. The author's hint wins because humans think in **concrete visual objects** (boxing ring, gloves, bridge, pit). LLM-generated scenes drift toward **abstract concepts** (coding duel, AI integration approaches) that Qwen can't render.

## Concrete objects beat abstract concepts

Qwen's text encoder reads natural language but can only render things it can see. Things that work well:

- Boxing ring, gloves, scoreboard
- Rickety bridge, dark pit, warning signs
- Glowing VS symbol, glowing brain
- Color-coded helmet details (blue vs red)

Things that don't work:

- "Tension in the air"
- "Coding duel arena"
- "AI integration approaches"
- "Test results between them"

If you can't draw it with a pencil in 5 seconds, Qwen can't render it either.

## Text rendering is unreliable but shapes work

Qwen can render the shape of a scoreboard, a road sign, or a label — but the actual text on it will be garbled. A scoreboard showing "15:12" reads as a scoreboard even if the numbers are wrong. Road signs saying "AI CLIENT" came out as "AI INTERATION". Use symbols and shapes over text whenever possible.

## Restyle: full-canvas input, not mascot-sized

When restyling an existing image, the source must fill the entire canvas (1280x720 for widescreen). The mascot pipeline scales images to 1/3 canvas width and centers them on white — if restyle uses that same path, Qwen sees a tiny image floating on a white background and interprets it as a label or texture to slap onto a 3D box.

The prompt matters too. "Isometric 3D, Pixar-style... Restyle preserving all elements" made Qwen create a 3D isometric scene *with* the image as a surface. "Redraw the reference image in a cute 3D Pixar-style render... Keep the same composition, layout, and all visual elements — only change the art style" tells Qwen to transform the *content*, not build a scene around it.

## The --hint is doing the creative heavy lifting

Without a hint, all prompts are the model's abstract interpretations of the post content. With a hint, prompt 1 is concrete and visual. The takeaway: invest time in the hint. A good hint like "two mascots in a boxing ring with blue and red gloves, glowing scoreboard above" produces better results than any amount of system prompt tuning.
