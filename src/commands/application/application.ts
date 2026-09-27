import { ChatInputCommandInteraction, SlashCommandBuilder, ChannelType, MessageFlags } from "discord.js";
import { requireStaff } from "../../utils/permissions";
import { ApplicationService } from "../../services/ApplicationService";
import { LoggingService } from "../../services/LoggingService";
import { successEmbed, paginate, paginationRow, humanTimestamp } from "../../utils/discord";
import { sanitizeText } from "../../utils/validation";
import { ValidationError } from "../../utils/errors";
import { buildSubmissionEmbed } from "../../services/TicketService";
import { QuestionType } from "../../models/Application";

const QUESTION_TYPE_CHOICES: { name: string; value: QuestionType }[] = [
  { name: "Short Text", value: "SHORT_TEXT" },
  { name: "Long Text", value: "LONG_TEXT" },
  { name: "Number", value: "NUMBER" },
  { name: "Yes/No", value: "YES_NO" },
  { name: "Choice (single)", value: "CHOICE" },
  { name: "Multiple Choice", value: "MULTIPLE_CHOICE" },
];

export const data = new SlashCommandBuilder()
  .setName("application")
  .setDescription("Create and manage applications/tryouts")
  .addSubcommand((sc) =>
    sc
      .setName("create")
      .setDescription("Create a new application")
      .addStringOption((o) => o.setName("name").setDescription("Unique name").setRequired(true))
      .addStringOption((o) => o.setName("description").setDescription("Shown to applicants when they start"))
  )
  .addSubcommand((sc) =>
    sc
      .setName("edit")
      .setDescription("Edit application settings")
      .addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true))
      .addChannelOption((o) => o.setName("ticket_category").setDescription("Category tickets are created under").addChannelTypes(ChannelType.GuildCategory))
      .addChannelOption((o) => o.setName("submission_channel").setDescription("Channel for submission logs").addChannelTypes(ChannelType.GuildText))
      .addRoleOption((o) => o.setName("staff_role").setDescription("Add a staff role that can review this application"))
      .addRoleOption((o) => o.setName("ping_role").setDescription("Role pinged on new submissions"))
      .addRoleOption((o) => o.setName("accepted_role").setDescription("Role granted on acceptance"))
      .addRoleOption((o) => o.setName("remove_role_on_accept").setDescription("Role removed on acceptance"))
      .addRoleOption((o) => o.setName("rejected_role").setDescription("Role granted on rejection"))
      .addBooleanOption((o) => o.setName("allow_multiple").setDescription("Allow re-applying after rejection/cancellation"))
      .addBooleanOption((o) => o.setName("dm_required").setDescription("Require DMs to be open to apply"))
      .addIntegerOption((o) => o.setName("cooldown_minutes").setDescription("Cooldown between submissions, in minutes").setMinValue(0))
      .addStringOption((o) => o.setName("description").setDescription("Shown to applicants when they start"))
  )
  .addSubcommand((sc) => sc.setName("delete").setDescription("Delete an application").addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand((sc) => sc.setName("list").setDescription("List applications").addIntegerOption((o) => o.setName("page").setDescription("Page number").setMinValue(1)))
  .addSubcommand((sc) => sc.setName("view").setDescription("View an application's full configuration").addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand((sc) => sc.setName("publish").setDescription("Start accepting submissions").addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand((sc) => sc.setName("unpublish").setDescription("Stop accepting submissions").addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand((sc) =>
    sc
      .setName("submissions")
      .setDescription("List submissions for an application")
      .addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true))
      .addStringOption((o) =>
        o.setName("status").setDescription("Filter by status").addChoices(
          { name: "Pending", value: "PENDING" },
          { name: "Accepted", value: "ACCEPTED" },
          { name: "Rejected", value: "REJECTED" },
          { name: "Closed", value: "CLOSED" },
          { name: "Cancelled", value: "CANCELLED" }
        )
      )
      .addIntegerOption((o) => o.setName("page").setDescription("Page number").setMinValue(1))
  )
  .addSubcommandGroup((g) =>
    g
      .setName("submission")
      .setDescription("Manage an individual submission")
      .addSubcommand((sc) =>
        sc.setName("view").setDescription("View a submission").addStringOption((o) => o.setName("submission").setDescription("Submission ID").setRequired(true))
      )
      .addSubcommand((sc) =>
        sc.setName("close").setDescription("Close a submission's ticket record").addStringOption((o) => o.setName("submission").setDescription("Submission ID").setRequired(true))
      )
  )
  .addSubcommandGroup((g) =>
    g
      .setName("questions")
      .setDescription("Manage an application's questions")
      .addSubcommand((sc) =>
        sc
          .setName("add")
          .setDescription("Add a question")
          .addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true))
          .addStringOption((o) => o.setName("text").setDescription("Question text").setRequired(true))
          .addStringOption((o) => o.setName("type").setDescription("Question type").setRequired(true).addChoices(...QUESTION_TYPE_CHOICES))
          .addBooleanOption((o) => o.setName("required").setDescription("Is this required? (default true)"))
          .addStringOption((o) => o.setName("choices").setDescription("Comma-separated choices (for Choice/Multiple Choice types)"))
          .addIntegerOption((o) => o.setName("max_length").setDescription("Max answer length").setMinValue(1).setMaxValue(4000))
      )
      .addSubcommand((sc) =>
        sc
          .setName("edit")
          .setDescription("Edit a question")
          .addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true))
          .addStringOption((o) => o.setName("question_id").setDescription("Question ID (see /application view)").setRequired(true))
          .addStringOption((o) => o.setName("text").setDescription("New question text"))
          .addBooleanOption((o) => o.setName("required").setDescription("Is this required?"))
          .addStringOption((o) => o.setName("choices").setDescription("Comma-separated choices"))
      )
      .addSubcommand((sc) =>
        sc
          .setName("remove")
          .setDescription("Remove a question")
          .addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true))
          .addStringOption((o) => o.setName("question_id").setDescription("Question ID").setRequired(true))
      )
      .addSubcommand((sc) =>
        sc
          .setName("reorder")
          .setDescription("Reorder questions")
          .addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true))
          .addStringOption((o) => o.setName("question_ids").setDescription("Comma-separated question IDs in new order").setRequired(true))
      )
      .addSubcommand((sc) =>
        sc
          .setName("list")
          .setDescription("List questions in order")
          .addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true))
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await requireStaff(interaction);
  const guildId = interaction.guildId!;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (!group) {
    switch (sub) {
      case "create": {
        const name = sanitizeText(interaction.options.getString("name", true), 100);
        const description = interaction.options.getString("description") ?? undefined;
        const doc = await ApplicationService.create(guildId, name, description, member.id);
        await interaction.reply({ embeds: [successEmbed(`Created application \`${name}\`. Add questions with \`/application questions add\`.`)], flags: MessageFlags.Ephemeral });
        await LoggingService.log(interaction.client, guildId, "CONFIG_CHANGED", `Application **${name}** created.`, { actorId: member.id, targetId: String(doc._id) });
        return;
      }
      case "edit": {
        const idOrName = interaction.options.getString("application", true);
        const patch: Record<string, unknown> = {};
        const ticketCategory = interaction.options.getChannel("ticket_category");
        const submissionChannel = interaction.options.getChannel("submission_channel");
        const pingRole = interaction.options.getRole("ping_role");
        const acceptedRole = interaction.options.getRole("accepted_role");
        const removeRoleOnAccept = interaction.options.getRole("remove_role_on_accept");
        const rejectedRole = interaction.options.getRole("rejected_role");
        const allowMultiple = interaction.options.getBoolean("allow_multiple");
        const dmRequired = interaction.options.getBoolean("dm_required");
        const cooldownMinutes = interaction.options.getInteger("cooldown_minutes");
        const description = interaction.options.getString("description");
        const staffRole = interaction.options.getRole("staff_role");

        if (ticketCategory) patch.ticketCategoryId = ticketCategory.id;
        if (submissionChannel) patch.submissionChannelId = submissionChannel.id;
        if (pingRole) patch.pingRoleId = pingRole.id;
        if (acceptedRole) patch.acceptedRoleId = acceptedRole.id;
        if (removeRoleOnAccept) patch.removeRoleIdOnAccept = removeRoleOnAccept.id;
        if (rejectedRole) patch.rejectedRoleId = rejectedRole.id;
        if (allowMultiple !== null) patch.allowMultiple = allowMultiple;
        if (dmRequired !== null) patch.dmRequired = dmRequired;
        if (cooldownMinutes !== null) patch.cooldownMs = cooldownMinutes * 60_000;
        if (description !== null) patch.description = description;

        let doc = await ApplicationService.update(guildId, idOrName, patch);
        if (staffRole) {
          doc = await ApplicationService.update(guildId, idOrName, {
            staffRoleIds: Array.from(new Set([...doc.staffRoleIds, staffRole.id])),
          });
        }

        await LoggingService.log(interaction.client, guildId, "CONFIG_CHANGED", `Application **${doc.name}** settings updated.`, { actorId: member.id, targetId: String(doc._id) });
        await interaction.reply({ embeds: [successEmbed(`Updated \`${doc.name}\`.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      case "delete": {
        const idOrName = interaction.options.getString("application", true);
        const doc = await ApplicationService.delete(guildId, idOrName);
        await LoggingService.log(interaction.client, guildId, "CONFIG_CHANGED", `Application **${doc.name}** deleted.`, { actorId: member.id, targetId: String(doc._id) });
        await interaction.reply({ embeds: [successEmbed(`Deleted \`${doc.name}\`.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      case "list": {
        const apps = await ApplicationService.list(guildId);
        const page = (interaction.options.getInteger("page") ?? 1) - 1;
        const { pageItems, totalPages, page: clampedPage } = paginate(apps, 10, page);
        const lines = pageItems.map((a) => `\`${String(a._id)}\` — **${a.name}** ${a.published ? "🟢 published" : "⚪ draft"} (${a.questions.length} questions)`);
        await interaction.reply({
          content: lines.join("\n") || "No applications yet. Create one with `/application create`.",
          components: totalPages > 1 ? [paginationRow("applist", clampedPage, totalPages)] : [],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      case "view": {
        const idOrName = interaction.options.getString("application", true);
        const app = await ApplicationService.getByIdOrName(guildId, idOrName);
        const questions = ApplicationService.sortedQuestions(app);
        const lines = [
          `**${app.name}** \`${String(app._id)}\` — ${app.published ? "🟢 Published" : "⚪ Draft"}`,
          app.description ? `_${app.description}_` : undefined,
          `Staff roles: ${app.staffRoleIds.map((r) => `<@&${r}>`).join(", ") || "none (guild staff only)"}`,
          `Ticket category: ${app.ticketCategoryId ? `<#${app.ticketCategoryId}>` : "guild default"}`,
          `Ping role: ${app.pingRoleId ? `<@&${app.pingRoleId}>` : "none"}`,
          `Accepted role: ${app.acceptedRoleId ? `<@&${app.acceptedRoleId}>` : "none"}${app.removeRoleIdOnAccept ? ` (removes <@&${app.removeRoleIdOnAccept}>)` : ""}`,
          `Rejected role: ${app.rejectedRoleId ? `<@&${app.rejectedRoleId}>` : "none"}`,
          `Allow multiple: ${app.allowMultiple ? "yes" : "no"} | Cooldown: ${app.cooldownMs / 60000}min | DM required: ${app.dmRequired ? "yes" : "no"}`,
          "",
          `**Questions (${questions.length})**`,
          ...questions.map((q, i) => `${i + 1}. \`${q.id}\` [${q.type}${q.required ? "" : ", optional"}] ${q.text}`),
        ].filter(Boolean);
        await interaction.reply({ content: lines.join("\n").slice(0, 1900), flags: MessageFlags.Ephemeral });
        return;
      }
      case "publish": {
        const idOrName = interaction.options.getString("application", true);
        const doc = await ApplicationService.getByIdOrName(guildId, idOrName);
        if (doc.questions.length === 0) throw new ValidationError("Add at least one question before publishing.");
        await ApplicationService.setPublished(guildId, idOrName, true);
        await interaction.reply({ embeds: [successEmbed(`\`${doc.name}\` is now published and accepting submissions.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      case "unpublish": {
        const idOrName = interaction.options.getString("application", true);
        const doc = await ApplicationService.setPublished(guildId, idOrName, false);
        await interaction.reply({ embeds: [successEmbed(`\`${doc.name}\` is no longer accepting submissions.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      case "submissions": {
        const idOrName = interaction.options.getString("application", true);
        const app = await ApplicationService.getByIdOrName(guildId, idOrName);
        const status = interaction.options.getString("status") ?? undefined;
        const submissions = await ApplicationService.listSubmissions(guildId, String(app._id), status);
        const page = (interaction.options.getInteger("page") ?? 1) - 1;
        const { pageItems, totalPages, page: clampedPage } = paginate(submissions, 10, page);
        const lines = pageItems.map(
          (s) => `\`${String(s._id)}\` — ${s.applicantTag} — **${s.status}** — ${humanTimestamp(s.createdAt)}`
        );
        await interaction.reply({
          content: lines.join("\n") || "No submissions found.",
          components: totalPages > 1 ? [paginationRow("subslist", clampedPage, totalPages)] : [],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }
    return;
  }

  if (group === "questions") {
    const idOrName = interaction.options.getString("application", true);
    switch (sub) {
      case "add": {
        const text = sanitizeText(interaction.options.getString("text", true), 300);
        const type = interaction.options.getString("type", true) as QuestionType;
        const required = interaction.options.getBoolean("required") ?? true;
        const choicesRaw = interaction.options.getString("choices");
        const choices = choicesRaw ? choicesRaw.split(",").map((c) => c.trim()).filter(Boolean) : [];
        const maxLength = interaction.options.getInteger("max_length") ?? undefined;
        const doc = await ApplicationService.addQuestion(guildId, idOrName, { text, type, required, choices, maxLength });
        const added = doc.questions[doc.questions.length - 1];
        await interaction.reply({ embeds: [successEmbed(`Added question \`${added.id}\`: ${text}`)], flags: MessageFlags.Ephemeral });
        return;
      }
      case "edit": {
        const questionId = interaction.options.getString("question_id", true);
        const text = interaction.options.getString("text");
        const required = interaction.options.getBoolean("required");
        const choicesRaw = interaction.options.getString("choices");
        const patch: Record<string, unknown> = {};
        if (text !== null) patch.text = sanitizeText(text, 300);
        if (required !== null) patch.required = required;
        if (choicesRaw !== null) patch.choices = choicesRaw.split(",").map((c) => c.trim()).filter(Boolean);
        await ApplicationService.editQuestion(guildId, idOrName, questionId, patch);
        await interaction.reply({ embeds: [successEmbed("Question updated.")], flags: MessageFlags.Ephemeral });
        return;
      }
      case "remove": {
        const questionId = interaction.options.getString("question_id", true);
        await ApplicationService.removeQuestion(guildId, idOrName, questionId);
        await interaction.reply({ embeds: [successEmbed("Question removed.")], flags: MessageFlags.Ephemeral });
        return;
      }
      case "reorder": {
        const idsRaw = interaction.options.getString("question_ids", true);
        const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
        await ApplicationService.reorderQuestions(guildId, idOrName, ids);
        await interaction.reply({ embeds: [successEmbed("Questions reordered.")], flags: MessageFlags.Ephemeral });
        return;
      }
      case "list": {
        const app = await ApplicationService.getByIdOrName(guildId, idOrName);
        const questions = ApplicationService.sortedQuestions(app);
        const lines = questions.map((q, i) => `${i + 1}. \`${q.id}\` [${q.type}${q.required ? "" : ", optional"}] ${q.text}`);
        await interaction.reply({ content: lines.join("\n") || "No questions yet.", flags: MessageFlags.Ephemeral });
        return;
      }
    }
    return;
  }

  if (group === "submission") {
    const submissionId = interaction.options.getString("submission", true);
    if (sub === "view") {
      const submission = await ApplicationService.getSubmission(guildId, submissionId);
      const app = await ApplicationService.getById(guildId, String(submission.applicationId));
      if (!app) throw new ValidationError("The parent application no longer exists.");
      await interaction.reply({ embeds: [buildSubmissionEmbed(app, submission)], flags: MessageFlags.Ephemeral });
    } else if (sub === "close") {
      const submission = await ApplicationService.close(guildId, submissionId);
      await interaction.reply({ embeds: [successEmbed(`Submission \`${String(submission._id)}\` marked as closed.`)], flags: MessageFlags.Ephemeral });
    }
    return;
  }
}
