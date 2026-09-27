import { Schema, Document, Types } from "mongoose";
import { registerModel } from "./modelHelper";
import { ISubmissionAnswer } from "./ApplicationSubmission";

export type SessionStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "EXPIRED";

/**
 * Tracks an in-progress DM application so it can survive a bot restart.
 * Only one active session per (userId, guildId, applicationId) should exist;
 * enforced at the service layer.
 */
export interface IApplicationSession extends Document {
  userId: string;
  guildId: string;
  applicationId: Types.ObjectId;
  currentQuestionIndex: number;
  answers: ISubmissionAnswer[];
  status: SessionStatus;
  dmChannelId?: string;
  startedAt: Date;
  lastInteractionAt: Date;
  updatedAt: Date;
}

const SessionAnswerSchema = new Schema<ISubmissionAnswer>(
  {
    questionId: { type: String, required: true },
    question: { type: String, required: true },
    answer: { type: String, required: true, maxlength: 4000 },
  },
  { _id: false }
);

const ApplicationSessionSchema = new Schema<IApplicationSession>(
  {
    userId: { type: String, required: true, index: true, match: /^\d{17,20}$/ },
    guildId: { type: String, required: true, index: true, match: /^\d{17,20}$/ },
    applicationId: { type: Schema.Types.ObjectId, ref: "Application", required: true },
    currentQuestionIndex: { type: Number, default: 0 },
    answers: { type: [SessionAnswerSchema], default: [] },
    status: {
      type: String,
      enum: ["IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"],
      default: "IN_PROGRESS",
      index: true,
    },
    dmChannelId: { type: String },
    startedAt: { type: Date, default: () => new Date() },
    lastInteractionAt: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

// A user should have at most one in-progress session per application.
ApplicationSessionSchema.index(
  { userId: 1, guildId: 1, applicationId: 1, status: 1 },
  { unique: false }
);

export const ApplicationSessionModel = registerModel<IApplicationSession>(
  "ApplicationSession",
  ApplicationSessionSchema
);
