import { Client, DMChannel, EmbedBuilder, Guild, Message, User } from "discord.js";
import { ApplicationService } from "../services/ApplicationService";
import { TicketService } from "../services/TicketService";
import { LoggingService } from "../services/LoggingService";
import { IApplication, IApplicationQuestion } from "../models/Application";
import { IApplicationSession } from "../models/ApplicationSession";

function questionPrompt(app: IApplication, index: number, total: number, q: IApplicationQuestion): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(app.name)
    .setDescription(`**Question ${index + 1}/${total}**\n\n${q.text}`)
    .setFooter({ text: 'Type your answer, or type "cancel" to stop.' });

  if (q.type === "YES_NO") embed.addFields({ name: "Answer with", value: "yes / no" });
  if (q.type === "NUMBER") embed.addFields({ name: "Answer with", value: "a number" });
  if ((q.type === "CHOICE" || q.type === "MULTIPLE_CHOICE") && q.choices.length) {
    embed.addFields({
      name: q.type === "CHOICE" ? "Pick one" : "Pick one or more (comma-separated)",
      value: q.choices.map((c, i) => `${i + 1}. ${c}`).join("\n"),
    });
  }
  if (!q.required) embed.addFields({ name: "Optional", value: 'Type "skip" to leave this blank.' });
  return embed;
}

function validateAnswer(q: IApplicationQuestion, raw: string): { ok: true; normalized: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase() === "skip") {
    if (q.required) return { ok: false, reason: "This question is required — it can't be skipped." };
    return { ok: true, normalized: "" };
  }
  if (q.maxLength && trimmed.length > q.maxLength) {
    return { ok: false, reason: `Please keep your answer under ${q.maxLength} characters.` };
  }
  switch (q.type) {
    case "NUMBER":
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return { ok: false, reason: "Please answer with a number." };
      break;
    case "YES_NO":
      if (!/^(yes|no|y|n)$/i.test(trimmed)) return { ok: false, reason: 'Please answer "yes" or "no".' };
      break;
    case "CHOICE": {
      const match = q.choices.find((c, i) => c.toLowerCase() === trimmed.toLowerCase() || String(i + 1) === trimmed);
      if (!match) return { ok: false, reason: `Please answer with one of: ${q.choices.join(", ")}` };
      return { ok: true, normalized: match };
    }
    case "MULTIPLE_CHOICE": {
      const parts = trimmed.split(",").map((p) => p.trim());
      const resolved: string[] = [];
      for (const part of parts) {
        const match = q.choices.find((c, i) => c.toLowerCase() === part.toLowerCase() || String(i + 1) === part);
        if (!match) return { ok: false, reason: `"${part}" isn't one of: ${q.choices.join(", ")}` };
        resolved.push(match);
      }
      return { ok: true, normalized: resolved.join(", ") };
    }
    default:
      break;
  }
  return { ok: true, normalized: trimmed };
}

/** Starts (or reports why it can't start) an application flow for a user via DM. Used by both the button and select-menu handlers. */
export async function startApplicationForUser(
  client: Client,
  guild: Guild,
  application: IApplication,
  user: User
): Promise<{ started: true } | { started: false; reason: string }> {
  const eligibility = await ApplicationService.checkEligibility(guild.id, application, user.id);
  if (!eligibility.eligible) return { started: false, reason: eligibility.reason };

  const questions = ApplicationService.sortedQuestions(application);
  if (questions.length === 0) {
    return { started: false, reason: "This application has no questions configured yet. Please contact staff." };
  }

  const dmChannel = await user.createDM().catch(() => null);
  if (!dmChannel) {
    return { started: false, reason: "I couldn't DM you — please enable DMs from server members and try again." };
  }

  const session = await ApplicationService.startSession(guild.id, String(application._id), user.id, dmChannel.id);

  await dmChannel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`Starting: ${application.name}`)
          .setDescription(application.description ?? `This application has ${questions.length} question(s). Answer them one at a time.`),
      ],
    })
    .catch(() => undefined);

  await dmChannel.send({ embeds: [questionPrompt(application, 0, questions.length, questions[0])] });

  await LoggingService.log(client, guild.id, "APPLICATION_STARTED", `<@${user.id}> started **${application.name}**.`, {
    actorId: user.id,
    targetId: String(session._id),
  });

  return { started: true };
}

/**
 * Handles an incoming DM message from a user who has an in-progress session.
 * Returns true if the message was consumed as part of an application flow.
 */
export async function handleApplicationDM(client: Client, message: Message): Promise<boolean> {
  const channel = message.channel as DMChannel;
  const session = await ApplicationService.getActiveSessionForUser(message.author.id);
  if (!session) return false;

  const application = await ApplicationService.getById(session.guildId, String(session.applicationId));
  if (!application) {
    await ApplicationService.cancelSession(session);
    await channel.send("This application no longer exists. Your session has been cancelled.").catch(() => undefined);
    return true;
  }

  const content = message.content.trim();
  if (/^cancel$/i.test(content)) {
    await ApplicationService.cancelSession(session);
    await channel.send("Application cancelled. You can start again any time.").catch(() => undefined);
    return true;
  }

  const questions = ApplicationService.sortedQuestions(application);
  const currentQuestion = questions[session.currentQuestionIndex];
  if (!currentQuestion) {
    // Shouldn't normally happen, but guard against a corrupted/stale session.
    await ApplicationService.cancelSession(session);
    await channel.send("Something went wrong with your application session. Please start again.").catch(() => undefined);
    return true;
  }

  const result = validateAnswer(currentQuestion, content);
  if (!result.ok) {
    await channel.send(`⚠️ ${result.reason}`).catch(() => undefined);
    return true;
  }

  const updatedSession = await ApplicationService.recordAnswer(session, currentQuestion.id, currentQuestion.text, result.normalized);

  if (updatedSession.currentQuestionIndex >= questions.length) {
    await finishApplication(client, updatedSession, application, message);
  } else {
    const nextQ = questions[updatedSession.currentQuestionIndex];
    await channel.send({ embeds: [questionPrompt(application, updatedSession.currentQuestionIndex, questions.length, nextQ)] }).catch(() => undefined);
  }

  return true;
}

async function finishApplication(client: Client, session: IApplicationSession, application: IApplication, message: Message): Promise<void> {
  const channel = message.channel as DMChannel;
  const applicantTag = message.author.tag ?? message.author.username;
  const submission = await ApplicationService.completeSession(session, session.guildId, application, applicantTag);

  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("Application submitted!")
          .setDescription("Thanks — your answers have been recorded and staff will review them shortly."),
      ],
    })
    .catch(() => undefined);

  await LoggingService.log(client, session.guildId, "APPLICATION_SUBMITTED", `<@${session.userId}> submitted **${application.name}**.`, {
    actorId: session.userId,
    targetId: String(submission._id),
  });

  try {
    const guild = await client.guilds.fetch(session.guildId);
    const channel = await TicketService.createApplicationTicket(client, guild, application, submission);
    await ApplicationService.setTicketChannel(session.guildId, String(submission._id), channel.id);
    await LoggingService.log(client, session.guildId, "TICKET_CREATED", `Ticket ${channel} created for **${application.name}** submission by <@${session.userId}>.`, {
      actorId: session.userId,
      targetId: String(submission._id),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[applicationFlow] Failed to create ticket:", err);
    await channel
      .send("Your application was saved, but I couldn't create a review ticket automatically. Staff have been notified.")
      .catch(() => undefined);
  }
}
