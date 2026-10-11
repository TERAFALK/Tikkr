import type { FeedbackKind } from "@prisma/client";

/**
 * Det rutan för fel och förslag behöver i webbläsaren.
 *
 * Egen fil eftersom feedback.ts når databasen, och rutan ligger i menyn, som
 * är en klientkomponent. Bara en typimport, som försvinner i bygget.
 */

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  BUG: "Fel",
  SUGGESTION: "Förslag",
  FEEDBACK: "Synpunkt",
};

export const FEEDBACK_KINDS = Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[];

/** Längre än så är inte ett meddelande utan en bilaga. */
export const MAX_BODY_LENGTH = 5000;
