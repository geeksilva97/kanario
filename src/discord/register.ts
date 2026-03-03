import { config, DISCORD_API_BASE } from "../config.ts";
import { createHttpClient } from "../http.ts";
import { COMMAND_DEFINITIONS } from "./commands.ts";

const { discordApplicationId, discordToken } = config;

if (!discordApplicationId || !discordToken) {
  console.error("Missing DISCORD_APPLICATION_ID or DISCORD_TOKEN environment variables.");
  process.exit(1);
}

const discordHttp = createHttpClient({
  baseUrl: DISCORD_API_BASE,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bot ${discordToken}`,
  },
});

console.log(`Registering ${COMMAND_DEFINITIONS.length} commands ...`);

const response = await discordHttp.request(`/applications/${discordApplicationId}/commands`, {
  method: "PUT",
  body: JSON.stringify(COMMAND_DEFINITIONS),
}).catch((err: unknown) => {
  console.error(`Failed to register commands: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});

// Discord PUT /commands returns an array — no SDK types for this endpoint
const result = await response.json() as { name: string; id: string }[];
console.log(`Registered ${result.length} commands:`);
for (const cmd of result) {
  console.log(`  /${cmd.name} (${cmd.id})`);
}
