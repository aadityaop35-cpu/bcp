import { ApplicationModel, IApplication, IApplicationQuestion, QuestionType } from "../models/Application";
import { ApplicationSubmissionModel, IApplicationSubmission } from "../models/ApplicationSubmission";
import { ApplicationSessionModel, IApplicationSession } from "../models/ApplicationSession";
import { NotFoundError, ValidationError } from "../utils/errors";
import { LIMITS } from "../config/core";

function randomId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export class ApplicationService {
  // ---------- Application CRUD ----------

  static async create(guildId: string, name: string, description: string | undefined, createdBy: string): Promise<IApplication> {
    const existing = await ApplicationModel.findOne({ guildId, name }).lean();
    if (existing) throw new ValidationError(`An application named "${name}" already exists in this server.`);
    return ApplicationModel.create({
      guildId,
      name,
      description,
      questions: [],
      staffRoleIds: [],
      allowMultiple: false,
      cooldownMs: 0,
      dmRequired: true,
      published: false,
      createdBy,
    });
  }

  static async getByIdOrName(guildId: string, idOrName: string): Promise<IApplication> {
    const byId = idOrName.match(/^[a-f0-9]{24}$/i) ? await ApplicationModel.findOne({ _id: idOrName, guildId }) : null;
    const doc = byId ?? (await ApplicationModel.findOne({ guildId, name: idOrName }));
    if (!doc) throw new NotFoundError(`Application "${idOrName}"`);
    return doc;
  }

  static async getById(guildId: string, id: string): Promise<IApplication | null> {
    return ApplicationModel.findOne({ _id: id, guildId });
  }

  static async list(guildId: string): Promise<IApplication[]> {
    return ApplicationModel.find({ guildId }).sort({ updatedAt: -1 }).lean() as unknown as IApplication[];
  }

  static async delete(guildId: string, idOrName: string): Promise<IApplication> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    await ApplicationModel.deleteOne({ _id: doc._id, guildId });
    return doc;
  }

  static async update(guildId: string, idOrName: string, patch: Partial<IApplication>): Promise<IApplication> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    Object.assign(doc, patch);
    await doc.save();
    return doc;
  }

  static async setPublished(guildId: string, idOrName: string, published: boolean): Promise<IApplication> {
    return this.update(guildId, idOrName, { published });
  }

  // ---------- Question management ----------

  static async addQuestion(
    guildId: string,
    idOrName: string,
    input: { text: string; type: QuestionType; required: boolean; choices?: string[]; maxLength?: number }
  ): Promise<IApplication> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    if (doc.questions.length >= LIMITS.MAX_APPLICATION_QUESTIONS) {
      throw new ValidationError(`Applications can have at most ${LIMITS.MAX_APPLICATION_QUESTIONS} questions.`);
    }
    if ((input.type === "CHOICE" || input.type === "MULTIPLE_CHOICE") && (!input.choices || input.choices.length < 2)) {
      throw new ValidationError("Choice questions need at least 2 choices.");
    }
    const question: IApplicationQuestion = {
      id: randomId(),
      text: input.text,
      type: input.type,
      required: input.required,
      choices: input.choices ?? [],
      maxLength: input.maxLength,
      order: doc.questions.length,
    };
    doc.questions.push(question);
    await doc.save();
    return doc;
  }

  static async editQuestion(
    guildId: string,
    idOrName: string,
    questionId: string,
    patch: Partial<Omit<IApplicationQuestion, "id" | "order">>
  ): Promise<IApplication> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    const q = doc.questions.find((qq) => qq.id === questionId);
    if (!q) throw new NotFoundError(`Question "${questionId}"`);
    Object.assign(q, patch);
    await doc.save();
    return doc;
  }

  static async removeQuestion(guildId: string, idOrName: string, questionId: string): Promise<IApplication> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    const before = doc.questions.length;
    doc.questions = doc.questions.filter((q) => q.id !== questionId);
    if (doc.questions.length === before) throw new NotFoundError(`Question "${questionId}"`);
    doc.questions.forEach((q, i) => (q.order = i));
    await doc.save();
    return doc;
  }

  static async reorderQuestions(guildId: string, idOrName: string, orderedQuestionIds: string[]): Promise<IApplication> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    if (orderedQuestionIds.length !== doc.questions.length) {
      throw new ValidationError("The reorder list must include every existing question exactly once.");
    }
    const byId = new Map(doc.questions.map((q) => [q.id, q]));
    const reordered: IApplicationQuestion[] = [];
    for (const id of orderedQuestionIds) {
      const q = byId.get(id);
      if (!q) throw new ValidationError(`Unknown question id "${id}" in reorder list.`);
      reordered.push(q);
    }
    reordered.forEach((q, i) => (q.order = i));
    doc.questions = reordered;
    await doc.save();
    return doc;
  }

  static sortedQuestions(app: IApplication): IApplicationQuestion[] {
    return [...app.questions].sort((a, b) => a.order - b.order);
  }

  // ---------- Eligibility ----------

  static async checkEligibility(
    guildId: string,
    application: IApplication,
    userId: string
  ): Promise<{ eligible: true } | { eligible: false; reason: string }> {
    if (!application.published) {
      return { eligible: false, reason: "This application is not currently accepting submissions." };
    }

    const existingSession = await ApplicationSessionModel.findOne({
      userId,
      guildId,
      applicationId: application._id,
      status: "IN_PROGRESS",
    }).lean();
    if (existingSession) {
      return { eligible: false, reason: "You already have an in-progress application for this. Check your DMs, or send `cancel` there to restart." };
    }

    const submissions = await ApplicationSubmissionModel.find({
      guildId,
      applicationId: application._id,
      applicantId: userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (submissions.length === 0) return { eligible: true };

    const latest = submissions[0];

    if (!application.allowMultiple && latest.status !== "REJECTED" && latest.status !== "CANCELLED") {
      return { eligible: false, reason: "You have already submitted this application." };
    }

    if (application.cooldownMs > 0) {
      const elapsed = Date.now() - latest.createdAt.getTime();
      if (elapsed < application.cooldownMs) {
        const remainingMs = application.cooldownMs - elapsed;
        const remainingMin = Math.ceil(remainingMs / 60_000);
        return { eligible: false, reason: `You're on cooldown. Try again in about ${remainingMin} minute(s).` };
      }
    }

    return { eligible: true };
  }

  // ---------- Sessions (resumable DM flow) ----------

  static async startSession(guildId: string, applicationId: string, userId: string, dmChannelId: string): Promise<IApplicationSession> {
    return ApplicationSessionModel.create({
      userId,
      guildId,
      applicationId,
      currentQuestionIndex: 0,
      answers: [],
      status: "IN_PROGRESS",
      dmChannelId,
      startedAt: new Date(),
      lastInteractionAt: new Date(),
    });
  }

  static async getActiveSessionForUser(userId: string): Promise<IApplicationSession | null> {
    // Cross-guild lookup: DMs have no guild context, so we find whichever
    // in-progress session this user has (there should only ever be one at a
    // time per application, but a user could theoretically have sessions in
    // different guilds — we take the most recently touched one).
    return ApplicationSessionModel.findOne({ userId, status: "IN_PROGRESS" }).sort({ lastInteractionAt: -1 });
  }

  static async recordAnswer(session: IApplicationSession, questionId: string, questionText: string, answer: string): Promise<IApplicationSession> {
    session.answers.push({ questionId, question: questionText, answer });
    session.currentQuestionIndex += 1;
    session.lastInteractionAt = new Date();
    await session.save();
    return session;
  }

  static async cancelSession(session: IApplicationSession): Promise<void> {
    session.status = "CANCELLED";
    await session.save();
  }

  static async completeSession(
    session: IApplicationSession,
    guildId: string,
    application: IApplication,
    applicantTag: string
  ): Promise<IApplicationSubmission> {
    const submission = await ApplicationSubmissionModel.create({
      guildId,
      applicationId: application._id,
      applicationName: application.name,
      applicantId: session.userId,
      applicantTag,
      answers: session.answers,
      status: "PENDING",
    });
    session.status = "COMPLETED";
    await session.save();
    return submission;
  }

  // ---------- Submissions ----------

  static async getSubmission(guildId: string, submissionId: string): Promise<IApplicationSubmission> {
    const doc = await ApplicationSubmissionModel.findOne({ _id: submissionId, guildId });
    if (!doc) throw new NotFoundError("Submission");
    return doc;
  }

  static async listSubmissions(guildId: string, applicationId?: string, status?: string): Promise<IApplicationSubmission[]> {
    const query: Record<string, unknown> = { guildId };
    if (applicationId) query.applicationId = applicationId;
    if (status) query.status = status;
    return ApplicationSubmissionModel.find(query).sort({ createdAt: -1 }).lean() as unknown as IApplicationSubmission[];
  }

  static async setTicketChannel(guildId: string, submissionId: string, channelId: string): Promise<IApplicationSubmission> {
    const doc = await this.getSubmission(guildId, submissionId);
    doc.ticketChannelId = channelId;
    await doc.save();
    return doc;
  }

  static async decide(
    guildId: string,
    submissionId: string,
    decision: "ACCEPTED" | "REJECTED",
    reviewerId: string,
    note?: string
  ): Promise<IApplicationSubmission> {
    const doc = await this.getSubmission(guildId, submissionId);
    if (doc.status === "ACCEPTED" || doc.status === "REJECTED") {
      throw new ValidationError(`This application has already been ${doc.status.toLowerCase()}.`);
    }
    doc.status = decision;
    doc.reviewedBy = reviewerId;
    doc.reviewedAt = new Date();
    if (note) doc.reviewNote = note;
    await doc.save();
    return doc;
  }

  static async close(guildId: string, submissionId: string): Promise<IApplicationSubmission> {
    const doc = await this.getSubmission(guildId, submissionId);
    doc.status = "CLOSED";
    await doc.save();
    return doc;
  }
}
