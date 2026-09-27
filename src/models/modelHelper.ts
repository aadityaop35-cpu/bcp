import mongoose, { Schema, Model, Document } from "mongoose";

/**
 * Registers a model once, safely handling ts-node-dev / hot-reload re-execution
 * of model files (which would otherwise throw "OverwriteModelError").
 */
export function registerModel<T extends Document>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) || mongoose.model<T>(name, schema);
}
