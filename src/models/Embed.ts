import { Schema, Document, Types } from "mongoose";
import { registerModel } from "./modelHelper";

export interface IEmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export interface IEmbedButton {
  id: string; // custom_id suffix
  label: string;
  emoji?: string;
  style: "PRIMARY" | "SECONDARY" | "SUCCESS" | "DANGER" | "LINK";
  url?: string; // required if style === LINK
  row: number;
}

export interface IApplicationOption {
  applicationId: Types.ObjectId;
  label: string;
  description?: string;
  emoji?: string;
  style: "PRIMARY" | "SECONDARY" | "SUCCESS" | "DANGER";
  displayAs: "BUTTON" | "SELECT";
  row: number;
}

export interface IPublishedMessage {
  channelId: string;
  messageId: string;
  publishedAt: Date;
}

export interface IEmbed extends Document {
  guildId: string;
  name: string;
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: { name: string; iconUrl?: string; url?: string };
  thumbnail?: string;
  image?: string;
  footer?: { text: string; iconUrl?: string };
  showTimestamp: boolean;
  fields: IEmbedField[];
  buttons: IEmbedButton[];
  applicationOptions: IApplicationOption[];
  publishedMessages: IPublishedMessage[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmbedFieldSchema = new Schema<IEmbedField>(
  {
    name: { type: String, required: true, maxlength: 256 },
    value: { type: String, required: true, maxlength: 1024 },
    inline: { type: Boolean, default: false },
  },
  { _id: false }
);

const EmbedButtonSchema = new Schema<IEmbedButton>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, maxlength: 80 },
    emoji: { type: String },
    style: { type: String, enum: ["PRIMARY", "SECONDARY", "SUCCESS", "DANGER", "LINK"], required: true },
    url: { type: String },
    row: { type: Number, required: true, min: 0, max: 4 },
  },
  { _id: false }
);

const ApplicationOptionSchema = new Schema<IApplicationOption>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: "Application", required: true },
    label: { type: String, required: true, maxlength: 80 },
    description: { type: String, maxlength: 100 },
    emoji: { type: String },
    style: { type: String, enum: ["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"], default: "PRIMARY" },
    displayAs: { type: String, enum: ["BUTTON", "SELECT"], default: "BUTTON" },
    row: { type: Number, required: true, min: 0, max: 4 },
  },
  { _id: false }
);

const PublishedMessageSchema = new Schema<IPublishedMessage>(
  {
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    publishedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const EmbedSchema = new Schema<IEmbed>(
  {
    guildId: { type: String, required: true, index: true, match: /^\d{17,20}$/ },
    name: { type: String, required: true, maxlength: 64 },
    title: { type: String, maxlength: 256 },
    description: { type: String, maxlength: 4096 },
    url: { type: String, maxlength: 512 },
    color: { type: Number },
    author: {
      name: { type: String, maxlength: 256 },
      iconUrl: { type: String },
      url: { type: String },
    },
    thumbnail: { type: String },
    image: { type: String },
    footer: {
      text: { type: String, maxlength: 2048 },
      iconUrl: { type: String },
    },
    showTimestamp: { type: Boolean, default: false },
    fields: { type: [EmbedFieldSchema], default: [], validate: (v: unknown[]) => v.length <= 25 },
    buttons: { type: [EmbedButtonSchema], default: [] },
    applicationOptions: { type: [ApplicationOptionSchema], default: [] },
    publishedMessages: { type: [PublishedMessageSchema], default: [] },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

// Guild isolation: a name is unique per guild, not globally.
EmbedSchema.index({ guildId: 1, name: 1 }, { unique: true });

export const EmbedModel = registerModel<IEmbed>("Embed", EmbedSchema);
