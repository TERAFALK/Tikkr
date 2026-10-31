import { createLoginTickets, safeNextWithin } from "@terafalk/auth/login-ticket";

export { safeNext } from "@terafalk/auth/login-ticket";
export type { LoginTicket, TicketExtra } from "@terafalk/auth/login-ticket";

/**
 * Lappen mellan inloggningens två steg. Reglerna ligger i @terafalk/auth, se
 * tf-framework. Cookienamnen är Tikkrs och får inte ändras under en inloggning.
 */
export type TicketScope = "admin" | "platform";

export const { encodeTicket, decodeTicket, issueTicket, rawTicket, readTicket, clearTicket } =
  createLoginTickets<TicketScope>({
    cookies: {
      admin: "tikkr_inloggning",
      platform: "tikkr_plattform_inloggning",
    },
  });

/**
 * En returadress INOM ADMINPANELEN, eller undefined. Säljsidans Beställ-knapp
 * skickar `?till=/admin/...` genom inloggningen. Se CLAUDE.md § 3.4.
 */
export function safeAdminNext(next: string | undefined | null): string | undefined {
  return safeNextWithin(next, "/admin", "/admin/login");
}
