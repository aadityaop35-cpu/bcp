import { ChatInputCommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import { requireDeveloper } from "../../utils/permissions";
import { ExtendedClient } from "../../index";
import { deployCommandsForGuild } from "../../deploy-commands";
import { successEmbed } from "../../utils/discord";

export const data = new SlashCommandBuilder()
  .setName("reload")
  .setDescription("[Developer] Reload slash commands for this guild without restarting the bot")
  .addStringOption((o) => o.setName("scope").setDescription("Where to reload").addChoices({ name: "This guild", value: "guild" }, { name: "Global", value: "global" }));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  requireDeveloper(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const client = interaction.client as ExtendedClient;
  const scope = interaction.options.getString("scope") ?? "guild";

  const count = await deployCommandsForGuild(client, scope === "guild" ? interaction.guildId ?? undefined : undefined);

  await interaction.editReply({
    embeds: [successEmbed(`Reloaded ${count} command(s) ${scope === "guild" ? "for this guild" : "globally (may take up to 1 hour to propagate)"}.`)],
  });
}
