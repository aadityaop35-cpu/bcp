import { ChatInputCommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import { requireDeveloper } from "../../utils/permissions";
import { DatabaseService } from "../../services/DatabaseService";
import { EmbedModel } from "../../models/Embed";
import { ApplicationModel } from "../../models/Application";
import { ApplicationSubmissionModel } from "../../models/ApplicationSubmission";
import { successEmbed } from "../../utils/discord";
import { confirmRow } from "../../utils/discord";
import { ValidationError } from "../../utils/errors";

export const data = new SlashCommandBuilder()
  .setName("database")
  .setDescription("[Developer] Database status and maintenance")
  .addSubcommand((sc) => sc.setName("status").setDescription("Show MongoDB connection status"))
  .addSubcommand((sc) =>
    sc
      .setName("purge-guild")
      .setDescription("Permanently delete ALL bot data for a guild")
      .addStringOption((o) => o.setName("guild_id").setDescription("Guild ID to purge").setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  requireDeveloper(interaction);
  const sub = interaction.options.getSubcommand();

  if (sub === "status") {
    const status = await DatabaseService.status();
    const [embeds, apps, submissions] = await Promise.all([
      EmbedModel.countDocuments(),
      ApplicationModel.countDocuments(),
      ApplicationSubmissionModel.countDocuments(),
    ]);
    await interaction.reply({
      content: [
        `**State:** ${status.state}`,
        `**Host:** ${status.host}`,
        `**DB name:** ${status.name}`,
        `**Collections:** ${status.collections}`,
        `**Embeds:** ${embeds} | **Applications:** ${apps} | **Submissions:** ${submissions}`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "purge-guild") {
    const guildId = interaction.options.getString("guild_id", true);
    if (!/^\d{17,20}$/.test(guildId)) throw new ValidationError("That doesn't look like a valid guild ID.");

    await interaction.reply({
      content: `⚠️ This will **permanently delete** all embeds, applications, submissions, and settings for guild \`${guildId}\`. This cannot be undone.`,
      components: [confirmRow(`dbpurge:${guildId}`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}
