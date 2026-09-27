import mongoose from "mongoose";
import { CORE_CONFIG } from "../config/core";

let connecting: Promise<typeof mongoose> | null = null;

export class DatabaseService {
  static async connect(): Promise<typeof mongoose> {
    if (mongoose.connection.readyState === 1) return mongoose;
    if (connecting) return connecting;

    mongoose.set("strictQuery", true);

    connecting = mongoose
      .connect(CORE_CONFIG.mongoUri, {
        serverSelectionTimeoutMS: 10_000,
      })
      .then((conn) => {
        // eslint-disable-next-line no-console
        console.log(`[DB] Connected to MongoDB (${conn.connection.name})`);
        return conn;
      })
      .catch((err) => {
        connecting = null;
        // eslint-disable-next-line no-console
        console.error("[DB] MongoDB connection failed:", err);
        throw err;
      });

    mongoose.connection.on("disconnected", () => {
      // eslint-disable-next-line no-console
      console.warn("[DB] MongoDB disconnected. Mongoose will attempt to reconnect automatically.");
    });

    mongoose.connection.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[DB] MongoDB connection error:", err);
    });

    return connecting;
  }

  static isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  static async disconnect(): Promise<void> {
    await mongoose.disconnect();
    connecting = null;
  }

  /** Basic stats used by /database status. */
  static async status(): Promise<{ state: string; host: string; name: string; collections: number }> {
    const conn = mongoose.connection;
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    const collections = conn.db ? (await conn.db.listCollections().toArray()).length : 0;
    return {
      state: states[conn.readyState] ?? "unknown",
      host: conn.host ?? "n/a",
      name: conn.name ?? "n/a",
      collections,
    };
  }
}
