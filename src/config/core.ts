import "dotenv/config";

/**
 * CORE_CONFIG holds ONLY values that should be set by the developer/operator
 * of the bot, sourced from the environment. Everything else (staff roles per
 * guild, ticket categories, embeds, applications, questions, logging
 * channels, etc.) lives in MongoDB and is configured at runtime through
 * slash commands — see src/services/*.
 */
function parseIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[CORE_CONFIG] Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

export const CORE_CONFIG = {
  botToken: requireEnv("DISCORD_TOKEN"),
  clientId: requireEnv("DISCORD_CLIENT_ID"),
  devGuildId: process.env.DEV_GUILD_ID || undefined,
  mongoUri: requireEnv("MONGO_URI"),

  // Bootstrap/fallback staff role IDs. Per-guild staff roles configured via
  // /settings staff are merged with these, so a bot operator always has a
  // safety net even in a guild that hasn't run /settings staff yet.
  staffRoleIds: parseIdList(process.env.STAFF_ROLE_IDS),

  // Developer user IDs — full override access to developer-only commands.
  developerUserIds: parseIdList(process.env.DEVELOPER_USER_IDS),
} as const;

export const LIMITS = {
  MAX_EMBED_FIELDS: 25,
  MAX_BUTTONS_PER_ROW: 5,
  MAX_ACTION_ROWS: 5,
  MAX_SELECT_OPTIONS: 25,
  MAX_APPLICATION_QUESTIONS: 50,
  DEFAULT_COOLDOWN_MS: 0,
} as const;
