import { Schema, Document, Types } from "mongoose";
import { registerModel } from "./modelHelper";

export type SubmissionStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CLOSED" | "CANCELLED";

export interface ISubmissionAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export interface IApplicationSubmission extends Document {
  guildId: string;
  applicationId: Types.ObjectId;
  applicationName: string; // denormalized snapshot for display even if application is later deleted

  applicantId: string;
  applicantTag: string;

  answers: ISubmissionAnswer[];

  status: SubmissionStatus;
  ticketChannelId?: string;

  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNote?: string;

  createdAt: Date;
  updatedAt: Date;
}

const AnswerSchema = new Schema<ISubmissionAnswer>(
  {
    questionId: { type: String, required: true },
    question: { type: String, required: true },
    answer: { type: String, required: true, maxlength: 4000 },
  },
  { _id: false }
);

const ApplicationSubmissionSchema = new Schema<IApplicationSubmission>(
  {
    guildId: { type: String, required: true, index: true, match: /^\d{17,20}$/ },
    applicationId: { type: Schema.Types.ObjectId, ref: "Application", required: true, index: true },
    applicationName: { type: String, required: true },

    applicantId: { type: String, required: true, index: true, match: /^\d{17,20}$/ },
    applicantTag: { type: String, required: true },

    answers: { type: [AnswerSchema], default: [] },

    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "CLOSED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    ticketChannelId: { type: String },

    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    reviewNote: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

// Guild isolation + fast lookups for cooldown/duplicate checks.
ApplicationSubmissionSchema.index({ guildId: 1, applicationId: 1, applicantId: 1, createdAt: -1 });

export const ApplicationSubmissionModel = registerModel<IApplicationSubmission>(
  "ApplicationSubmission",
  ApplicationSubmissionSchema
);
