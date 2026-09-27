import { ChatInputCommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import { requireStaff } from "../../utils/permissions";
import { ApplicationService } from "../../services/ApplicationService";
import { TicketService, buildSubmissionEmbed, ticketButtonsRow } from "../../services/TicketService";
import { ValidationError } from "../../utils/errors";
import { PermissionService } from "../../services/PermissionService";
import { GuildMember } from "discord.js";
import { PermissionError } from "../../utils/errors";
import { successEmbed } from "../../utils/discord";

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Application ticket utilities")
  .addSubcommand((sc) => sc.setName("info").setDescription("Show the submission behind the current ticket channel"))
  .addSubcommand((sc) => sc.setName("resend-controls").setDescription("Re-post the Accept/Reject/Close buttons in this ticket"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await requireStaff(interaction);
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();

  const channel = interaction.channel;
  if (!channel || !("topic" in channel)) {
    throw new ValidationError("This command must be used inside an application ticket channel.");
  }
  const { submissionId } = TicketService.assertIsTicketChannel((channel as { topic: string | null }).topic);

  const submission = await ApplicationService.getSubmission(guildId, submissionId);
  const application = await ApplicationService.getById(guildId, String(submission.applicationId));
  if (!application) throw new ValidationError("The parent application no longer exists.");

  const member = interaction.member as GuildMember;
  const ok = await PermissionService.isApplicationStaff(member, application.staffRoleIds);
  if (!ok) throw new PermissionError("Only staff assigned to this application can use ticket commands here.");

  if (sub === "info") {
    await interaction.reply({ embeds: [buildSubmissionEmbed(application, submission)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "resend-controls") {
    await interaction.reply({
      embeds: [buildSubmissionEmbed(application, submission)],
      components: [ticketButtonsRow(submissionId, submission.status !== "PENDING")],
    });
  }
}
