import { ChatInputCommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import { requireDeveloper } from "../../utils/permissions";
import { CORE_CONFIG } from "../../config/core";

export const data = new SlashCommandBuilder()
  .setName("bot-config")
  .setDescription("[Developer] View the bot's core (env-driven) configuration")
  .addSubcommand((sc) => sc.setName("view").setDescription("Show current core config"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  requireDeveloper(interaction);

  const lines = [
    `**Client ID:** ${CORE_CONFIG.clientId}`,
    `**Dev guild:** ${CORE_CONFIG.devGuildId ?? "none (global commands)"}`,
    `**Bootstrap staff roles:** ${CORE_CONFIG.staffRoleIds.map((r) => `<@&${r}>`).join(", ") || "none"}`,
    `**Developer users:** ${CORE_CONFIG.developerUserIds.map((u) => `<@${u}>`).join(", ") || "none"}`,
    `**Mongo URI:** ||${CORE_CONFIG.mongoUri.replace(/\/\/.*@/, "//<redacted>@")}||`,
  ];

  await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
}
