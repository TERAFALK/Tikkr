import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { unsafeGlobalPrisma } from "./db";
import { verifyAdminCode, verifyEmailLoginCode } from "./admin-mfa";
import { decodeTicket } from "./login-ticket";
import { isTrustedDevice } from "./trusted-device";
import { clientIpFrom } from "./client-ip";

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
 * Det finns ingen väg in med bara ett lösenord. Inbjudan och återställningen
 * lämnar en lapp och skickar vidare hit; REGISTRERINGEN ÄR UNDANTAGET sedan
 * 2026-10-11, se nedan.
 *
 * Steg två klaras på ett av fyra sätt:
 *
 *   app      koden från autentiseringsappen, som alltid finns
 *   email    en kod via e-post, inloggningsalternativet, se admin-mfa.ts
 *   device   en dator där personen bett oss komma ihåg den, se
 *            trusted-device.ts — lösenordet är ändå kontrollerat i steg ett
 *   signup   en nyss skapad arbetsyta, utan kod (2026-10-11). Gäller EN
 *            session, se authorize nedan och § 4 punkt 5 i CLAUDE.md
 *
 * Uppslaget av användaren går via den ofiltrerade databasklienten, eftersom vi
 * inte vet vilket företag personen tillhör förrän vi hittat kontot. Efter
 * inloggning går all åtkomst via forCompany() — se requireAdmin() i
 * src/lib/admin-session.ts.
 */

/**
 * Sättet registreringen loggar in på, utan kod.
 *
 * Som sträng och inte som ett löst "signup" på två ställen: namnet står i
 * registreringens åtgärd och här, och ett stavfel på endera sidan hade betytt
 * att inloggningen tyst föll tillbaka på att kräva en kod som inte finns.
 */
export const SIGNUP_METHOD = "signup";

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

      async authorize(credentials, request) {
        const ticket = decodeTicket("admin", String(credentials?.ticket ?? ""));
        if (!ticket) return null;

        const code = String(credentials?.code ?? "");
        const method = String(credentials?.method ?? "app");

        // Adressen för spärren per IP på koden, se admin-mfa.ts. Auth.js
        // bygger anropet ur det inkommande, även när signIn() kallas från en
        // serveråtgärd, så det är vår egen proxys X-Forwarded-For som läses.
        const ip = clientIpFrom(request.headers);

        // FÖRSTA SESSIONEN EFTER EN REGISTRERING (2026-10-11).
        //
        // Ingen kod, eftersom det inte finns någon app att ta den ur: kontot
        // skapades för några sekunder sedan. Lappen är beviset, och den är
        // signerad, gäller i tio minuter och bärs av cookien som
        // registreringen just satte. Villkoret `ticket.fresh` kan alltså inte
        // sättas av någon annan än vår egen registrering.
        //
        // Sessionen MÄRKS, se mfaDeferred nedan. Den är den enda som
        // currentAdmin() släpper in utan uppsatt app, och nästa inloggning går
        // den vanliga vägen, där QR-koden möter den som inte hunnit koppla
        // appen. Se § 4 punkt 5 i CLAUDE.md.
        const fresh = method === SIGNUP_METHOD && ticket.fresh === true;

        const passed =
          fresh ||
          (method === "device"
            ? await isTrustedDevice(String(credentials?.device ?? ""), ticket.sub)
            : method === "email"
              ? await verifyEmailLoginCode(
                  ticket.sub,
                  code,
                  ticket.afterReset === true,
                  new Date(),
                  ip
                )
              : await verifyAdminCode(ticket.sub, code, new Date(), ip));

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
          // Bara den allra första sessionen, och bara så länge appen inte är
          // kopplad. currentAdmin() läser den.
          mfaDeferred: fresh,
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
        token.mfaDeferred = user.mfaDeferred === true;
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

      // Satt bara på den första sessionen efter en registrering. Se authorize.
      session.user.mfaDeferred = token.mfaDeferred === true;

      return session;
    },
  },
});
