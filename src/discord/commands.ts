import fs from "node:fs";
import { config } from "../config.ts";
import { generateWorkflow } from "../workflows/generate.ts";
import { pickWorkflow } from "../workflows/pick.ts";
import { resolveImagePath } from "../commands/pick.ts";
import { fetchDraft, resolvePostId } from "../wordpress.ts";

// Discord interaction response types
const DEFERRED_CHANNEL_MESSAGE = 5;

// Slash command definitions (for registration)
export const COMMAND_DEFINITIONS = [
  {
    name: "generate",
    description: "Generate thumbnail images for a WordPress draft",
    options: [
      {
        name: "post_id",
        description: "WordPress post ID or wp-admin URL",
        type: 3, // STRING
        required: true,
      },
      {
        name: "model",
        description: "LLM for prompt generation",
        type: 3, // STRING
        choices: [
          { name: "Gemini (default)", value: "gemini" },
          { name: "Claude", value: "claude" },
        ],
      },
      {
        name: "image_model",
        description: "Image generation backend",
        type: 3, // STRING
        choices: [
          { name: "Qwen on RunPod (default)", value: "qwen" },
          { name: "Nano Banana (Vertex AI)", value: "nano-banana" },
        ],
      },
      {
        name: "hint",
        description: "Guide the visual metaphor",
        type: 3, // STRING
      },
    ],
  },
  {
    name: "pick",
    description: "Upload an image and set it as the post's featured image",
    options: [
      {
        name: "post_id",
        description: "WordPress post ID or wp-admin URL",
        type: 3, // STRING
        required: true,
      },
      {
        name: "image",
        description: 'Image shorthand (e.g. "2") or full file path',
        type: 3, // STRING
        required: true,
      },
    ],
  },
];

function getOptionValue(interaction: any, name: string): string | undefined {
  const options = interaction.data?.options || [];
  const opt = options.find((o: any) => o.name === name);
  return opt?.value;
}

function getUserMention(interaction: any): string {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  return userId ? `<@${userId}>` : "";
}

async function editOriginalMessage(
  token: string,
  content: string,
  files?: { name: string; path: string }[],
) {
  const url = `https://discord.com/api/v10/webhooks/${config.discordApplicationId}/${token}/messages/@original`;

  if (!files || files.length === 0) {
    await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${config.discordToken}`,
      },
      body: JSON.stringify({ content }),
    });
    return;
  }

  // Multipart form data with file attachments
  const boundary = `----kanario${Date.now()}`;
  const parts: Buffer[] = [];

  // JSON payload part with attachments metadata
  const payload = {
    content,
    attachments: files.map((f, i) => ({ id: i, filename: f.name })),
  };

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n`,
    ),
  );

  // File parts
  for (const [i, file] of files.entries()) {
    const fileData = fs.readFileSync(file.path);
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files[${i}]"; filename="${file.name}"\r\nContent-Type: image/png\r\n\r\n`,
      ),
    );
    parts.push(fileData);
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Authorization: `Bot ${config.discordToken}`,
    },
    body,
  });
}

async function handleGenerate(interaction: any) {
  const token = interaction.token;
  const rawPostId = getOptionValue(interaction, "post_id") || "";
  const model = (getOptionValue(interaction, "model") || "gemini") as "gemini" | "claude";
  const imageModel = (getOptionValue(interaction, "image_model") || "qwen") as "qwen" | "nano-banana";
  const hint = getOptionValue(interaction, "hint");

  try {
    const postId = await resolvePostId(rawPostId);
    const progressMessages: string[] = [];

    const result = await generateWorkflow(
      { postId, model, imageModel, wide: true, hint },
      (msg) => progressMessages.push(msg),
    );

    const promptList = result.prompts
      .map((p, i) => `**${i + 1}.** ${p.scene}`)
      .join("\n");

    const mention = getUserMention(interaction);
    const content = `${mention} **${result.postTitle}**\n\n${promptList}\n\nGenerated ${result.imagePaths.length} images:`;

    const files = result.imagePaths.map((p) => ({
      name: p.split("/").pop()!,
      path: p,
    }));

    await editOriginalMessage(token, content, files);
  } catch (err) {
    const mention = getUserMention(interaction);
    const msg = err instanceof Error ? err.message : String(err);
    await editOriginalMessage(token, `${mention} Generation failed: ${msg}`);
  }
}

async function handlePick(interaction: any) {
  const token = interaction.token;
  const rawPostId = getOptionValue(interaction, "post_id") || "";
  const imageArg = getOptionValue(interaction, "image") || "";

  try {
    const postId = await resolvePostId(rawPostId);
    const imagePath = resolveImagePath(postId, imageArg);
    const post = await fetchDraft(postId);

    const result = await pickWorkflow({ postId, imagePath });
    const mention = getUserMention(interaction);

    await editOriginalMessage(
      token,
      `${mention} Featured image set for **${post.title}**\n\nImage: \`${imageArg}\`\nMedia ID: ${result.mediaId}`,
    );
  } catch (err) {
    const mention = getUserMention(interaction);
    const msg = err instanceof Error ? err.message : String(err);
    await editOriginalMessage(token, `${mention} Pick failed: ${msg}`);
  }
}

export function handleInteraction(body: any) {
  const commandName = body.data?.name;

  // Fire-and-forget: run the handler without awaiting
  if (commandName === "generate") {
    handleGenerate(body);
  } else if (commandName === "pick") {
    handlePick(body);
  }

  // Return deferred response immediately (under 3s deadline)
  return { type: DEFERRED_CHANNEL_MESSAGE };
}
