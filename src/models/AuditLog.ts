import { Schema, Document } from "mongoose";
import { registerModel } from "./modelHelper";

export type AuditEventType =
  | "APPLICATION_STARTED"
  | "APPLICATION_SUBMITTED"
  | "TICKET_CREATED"
  | "APPLICATION_ACCEPTED"
  | "APPLICATION_REJECTED"
  | "APPLICATION_CLOSED"
  | "APPLICATION_CANCELLED"
  | "EMBED_CREATED"
  | "EMBED_EDITED"
  | "EMBED_DELETED"
  | "CONFIG_CHANGED";

export interface IAuditLog extends Document {
  guildId: string;
  type: AuditEventType;
  actorId?: string; // staff member or user responsible, if any
  targetId?: string; // e.g. submission id, embed id, application id
  message: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    guildId: { type: String, required: true, index: true, match: /^\d{17,20}$/ },
    type: { type: String, required: true, index: true },
    actorId: { type: String },
    targetId: { type: String },
    message: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLogModel = registerModel<IAuditLog>("AuditLog", AuditLogSchema);
