import type { z } from "zod";

/**
 * Integrationens inställningar, validerade mot providerns schema. Ogiltiga
 * eller saknade värden ger schemats standard, så att en gammal rad aldrig
 * stoppar en synk.
 */
export function readSettings<S extends z.ZodType>(schema: S, stored: unknown): z.infer<S> {
  const parsed = schema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;
  return schema.parse({});
}
