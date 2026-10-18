/**
 * HUR LÄNGE EN INLOGGNING I PANELEN GÄLLER: SJU DAGAR, RÄKNAT FRÅN
 * INLOGGNINGEN (ändrat 2026-10-18, se § 4 punkt 3 i CLAUDE.md).
 *
 * Egen fil utan importer, eftersom både auth.ts och admin-session.ts läser den,
 * och testerna av admin-session.ts ersätter auth.ts helt.
 */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
