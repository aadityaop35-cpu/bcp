import { ValidationError } from "./errors";

const SNOWFLAKE_RE = /^\d{17,20}$/;
const HEX_COLOR_RE = /^#?[0-9a-fA-F]{6}$/;

export function isSnowflake(id: string | undefined | null): id is string {
  return typeof id === "string" && SNOWFLAKE_RE.test(id);
}

export function assertSnowflake(id: string | undefined | null, label: string): string {
  if (!isSnowflake(id)) {
    throw new ValidationError(`${label} must be a valid Discord ID.`);
  }
  return id;
}

/** Parses a user-supplied color string (#RRGGBB, RRGGBB, or a named discord.js color) into an int. */
export function parseColor(input: string | undefined | null): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (HEX_COLOR_RE.test(trimmed)) {
    return parseInt(trimmed.replace("#", ""), 16);
  }
  const named: Record<string, number> = {
    red: 0xed4245,
    green: 0x57f287,
    blue: 0x3498db,
    yellow: 0xfee75c,
    purple: 0x9b59b6,
    orange: 0xe67e22,
    black: 0x000000,
    white: 0xffffff,
    blurple: 0x5865f2,
    grey: 0x95a5a6,
    gray: 0x95a5a6,
  };
  const lower = trimmed.toLowerCase();
  if (lower in named) return named[lower];
  throw new ValidationError(
    `"${input}" is not a valid color. Use a hex code like #5865F2 or a name like blurple.`
  );
}

/** Strips characters that could be used for mention/markdown injection abuse in staff-facing contexts is NOT needed
 * (Discord already sanitizes rendering), but we trim length and null bytes for storage safety. */
export function sanitizeText(input: string, maxLength = 4000): string {
  return input.replace(/\u0000/g, "").trim().slice(0, maxLength);
}

export function assertLength(input: string, min: number, max: number, label: string): string {
  if (input.length < min || input.length > max) {
    throw new ValidationError(`${label} must be between ${min} and ${max} characters.`);
  }
  return input;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}
