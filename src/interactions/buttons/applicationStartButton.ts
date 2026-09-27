import { ButtonInteraction, StringSelectMenuInteraction, MessageFlags } from "discord.js";
import { ApplicationService } from "../../services/ApplicationService";
import { startApplicationForUser } from "../applicationFlow";
import { NotFoundError } from "../../utils/errors";
import { infoEmbed, successEmbed } from "../../utils/discord";

/** Handles customIds of the form app:start:<embedId>:<applicationId> */
export async function handleApplicationStartButton(interaction: ButtonInteraction): Promise<void> {
  const [, , , applicationId] = interaction.customId.split(":");
  await handleStart(interaction, applicationId);
}

/** Handles customIds of the form app:select:<embedId> with the select's value = applicationId */
export async function handleApplicationSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const applicationId = interaction.values[0];
  await handleStart(interaction, applicationId);
}

async function handleStart(interaction: ButtonInteraction | StringSelectMenuInteraction, applicationId: string): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const application = await ApplicationService.getById(guildId, applicationId);
  if (!application) throw new NotFoundError("Application");

  const result = await startApplicationForUser(interaction.client, interaction.guild!, application, interaction.user);
  if (result.started) {
    await interaction.editReply({ embeds: [successEmbed("Check your DMs — I've sent you the first question!")] });
  } else {
    await interaction.editReply({ embeds: [infoEmbed(`⚠️ ${result.reason}`)] });
  }
}
