import { Schema, Document } from "mongoose";
import { registerModel } from "./modelHelper";

export type QuestionType = "SHORT_TEXT" | "LONG_TEXT" | "NUMBER" | "YES_NO" | "CHOICE" | "MULTIPLE_CHOICE";

export interface IApplicationQuestion {
  id: string; // stable short id, independent of array position
  text: string;
  type: QuestionType;
  required: boolean;
  choices: string[]; // used for CHOICE / MULTIPLE_CHOICE
  maxLength?: number; // used for SHORT_TEXT / LONG_TEXT
  order: number;
}

export interface IApplication extends Document {
  guildId: string;
  name: string;
  description?: string;
  questions: IApplicationQuestion[];

  staffRoleIds: string[]; // roles who can review THIS application's tickets (merged with guild staff roles)
  ticketCategoryId?: string;
  submissionChannelId?: string; // channel where the "new submission" log/embed is posted
  pingRoleId?: string;

  acceptedRoleId?: string;
  removeRoleIdOnAccept?: string; // e.g. remove "Applicant" role on accept
  rejectedRoleId?: string;

  allowMultiple: boolean;
  cooldownMs: number;
  dmRequired: boolean;

  published: boolean;

  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema<IApplicationQuestion>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, maxlength: 300 },
    type: {
      type: String,
      enum: ["SHORT_TEXT", "LONG_TEXT", "NUMBER", "YES_NO", "CHOICE", "MULTIPLE_CHOICE"],
      required: true,
    },
    required: { type: Boolean, default: true },
    choices: { type: [String], default: [] },
    maxLength: { type: Number },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const ApplicationSchema = new Schema<IApplication>(
  {
    guildId: { type: String, required: true, index: true, match: /^\d{17,20}$/ },
    name: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 1000 },
    questions: { type: [QuestionSchema], default: [] },

    staffRoleIds: { type: [String], default: [] },
    ticketCategoryId: { type: String },
    submissionChannelId: { type: String },
    pingRoleId: { type: String },

    acceptedRoleId: { type: String },
    removeRoleIdOnAccept: { type: String },
    rejectedRoleId: { type: String },

    allowMultiple: { type: Boolean, default: false },
    cooldownMs: { type: Number, default: 0 },
    dmRequired: { type: Boolean, default: true },

    published: { type: Boolean, default: false },

    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

ApplicationSchema.index({ guildId: 1, name: 1 }, { unique: true });

export const ApplicationModel = registerModel<IApplication>("Application", ApplicationSchema);
