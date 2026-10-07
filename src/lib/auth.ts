import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { unsafeGlobalPrisma } from "./db";
import { verifyAdminCode, verifyEmailLoginCode } from "./admin-mfa";
import { decodeTicket } from "./login-ticket";
import { isTrustedDevice } from "./trusted-device";

/**
 * INLOGGNING FÖR ADMINISTRATÖRER.
 *
 * Kiosken loggar aldrig in — den identifieras med sin skärmtoken. Det här
 * gäller bara adminpanelen.
 *
 * TVÅ STEG (ändrat 2026-10-06). Lösenordet kontrolleras i steg ett, se
 * checkAdminPassword i admin-mfa.ts, som lämnar en signerad lapp i
 * webbläsaren. Den här inloggningen är steg två: den tar emot lappen och
 * koden från autentiseringsappen, och skapar en session bara när BÅDA håller.
 * Det finns ingen väg in med bara ett lösenord — inte heller från
 * registreringen, inbjudan eller återställningen, som alla lämnar en lapp och
 * skickar vidare hit.
 *
 * Steg två klaras på ett av tre sätt (2026-10-07):
 *
 *   app      koden från autentiseringsappen, som alltid finns
 *   email    en kod via e-post, inloggningsalternativet, se admin-mfa.ts
 *   device   en dator där personen bett oss komma ihåg den, se
 *            trusted-device.ts — lösenordet är ändå kontrollerat i steg ett
 *
 * Uppslaget av användaren går via den ofiltrerade databasklienten, eftersom vi
 * inte vet vilket företag personen tillhör förrän vi hittat kontot. Efter
 * inloggning går all åtkomst via forCompany() — se requireAdmin() i
 * src/lib/admin-session.ts.
 */

export const { handlers, auth, signIn, signOut } = NextAuth({
  /**
   * SJU DAGAR (ändrat 2026-10-06; trettio dagar från början, en kort tid tolv
   * timmar).
   *
   * Tolv timmar betydde lösenord och kod varje morgon, och det sliter mer på
   * den som använder panelen än det skyddar. Med tvåstegsinloggning räcker
   * inte ett stulet lösenord längre, och "Logga ut på alla enheter" stänger en
   * glömd inloggning på en delad dator.
   */
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },

  pages: {
    signIn: "/admin/login",
  },

  providers: [
    Credentials({
      credentials: {
        ticket: { type: "text" },
        code: { type: "text" },
        method: { type: "text" },
        device: { type: "text" },
      },

      async authorize(credentials) {
        const ticket = decodeTicket("admin", String(credentials?.ticket ?? ""));
        if (!ticket) return null;

        const code = String(credentials?.code ?? "");
        const method = String(credentials?.method ?? "app");

        const passed =
          method === "device"
            ? await isTrustedDevice(String(credentials?.device ?? ""), ticket.sub)
            : method === "email"
              ? await verifyEmailLoginCode(
                  ticket.sub,
                  code,
                  ticket.afterReset === true
                )
              : await verifyAdminCode(ticket.sub, code);

        if (!passed) return null;

        const user = await unsafeGlobalPrisma.adminUser.findUnique({
          where: { id: ticket.sub },
          include: { company: { select: { name: true } } },
        });

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          companyId: user.companyId,
          companyName: user.company.name,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    // Företag och roll läggs i sessionen vid inloggning, så att varje
    // sidladdning slipper slå upp dem på nytt.
    jwt({ token, user }) {
      if (user) {
        token.companyId = user.companyId;
        token.companyName = user.companyName;
        token.role = user.role;
      }
      return token;
    },

    session({ session, token }) {
      session.user.id = String(token.sub);
      session.user.companyId = String(token.companyId);
      session.user.companyName = String(token.companyName);
      session.user.role = String(token.role);

      // Utfärdandetiden sätts av next-auth och följer med hit. Den behövs för
      // att kunna avvisa sessioner som är äldre än ett lösenordsbyte.
      session.user.issuedAt = typeof token.iat === "number" ? token.iat : undefined;

      return session;
    },
  },
});
