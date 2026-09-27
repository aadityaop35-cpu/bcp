import { Schema, Document } from "mongoose";
import { registerModel } from "./modelHelper";

export interface IGuildConfig extends Document {
  guildId: string;
  staffRoleIds: string[];
  logChannelId?: string;
  ticketCategoryId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GuildConfigSchema = new Schema<IGuildConfig>(
  {
    guildId: { type: String, required: true, unique: true, index: true, match: /^\d{17,20}$/ },
    staffRoleIds: { type: [String], default: [] },
    logChannelId: { type: String, default: undefined },
    ticketCategoryId: { type: String, default: undefined },
  },
  { timestamps: true }
);

export const GuildConfigModel = registerModel<IGuildConfig>("GuildConfig", GuildConfigSchema);
