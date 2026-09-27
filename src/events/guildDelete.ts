import { Events, Guild } from "discord.js";

export const name = Events.GuildDelete;

/**
 * We intentionally do NOT delete the guild's data (embeds, applications,
 * submissions, config) when the bot is removed from a server — re-adding the
 * bot should restore everything. Operators can purge data explicitly via
 * /database purge-guild if they want it gone for good.
 */
export async function execute(guild: Guild): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[guildDelete] Removed from guild ${guild.id} (${guild.name ?? "unknown"}). Data retained.`);
}
