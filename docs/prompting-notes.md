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

## The --hint is doing the creative heavy lifting

Without a hint, all prompts are the model's abstract interpretations of the post content. With a hint, prompt 1 is concrete and visual. The takeaway: invest time in the hint. A good hint like "two mascots in a boxing ring with blue and red gloves, glowing scoreboard above" produces better results than any amount of system prompt tuning.
