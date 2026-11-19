import { createHash } from "node:crypto";

/**
 * Fingeravtryck av en post, oberoende av i vilken ordning fälten kom.
 *
 * Avgör om en post ändrats sedan förra gången. JSON.stringify räcker inte:
 * {a, b} och {b, a} är samma post men två olika strängar, och varje synk
 * skulle då se allt som ändrat.
 */
export function stableHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
}
