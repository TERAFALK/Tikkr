import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "./db";
import {
  clearFailedLogins,
  isLockedOut,
  noteFailedLogin,
} from "./login-throttle";

/**
 * INLOGGNING FÖR ADMINISTRATÖRER.
 *
 * Kiosken loggar aldrig in — den identifieras med sin skärmtoken. Det här
 * gäller bara adminpanelen, där en människa loggar in med e-post och lösenord.
 *
 * Lösenord sparas som bcrypt-hash. Till skillnad från skärmtokens, som är långa
 * och slumpade, är lösenord korta och ofta återanvända. De behöver därför en
 * medvetet långsam hashning som gör det opraktiskt att gissa sig fram även om
 * någon kommer över databasen.
 *
 * Uppslaget av användaren går via den ofiltrerade databasklienten, eftersom vi
 * inte vet vilket företag personen tillhör förrän vi hittat kontot. Efter
 * inloggning går all åtkomst via forCompany() — se requireAdmin() i
 * src/lib/admin-session.ts.
 *
 * Antalet gissningar är begränsat, se src/lib/login-throttle.ts. Utan den
 * spärren skyddar bcrypt bara mot att gissa SNABBT, inte mot att gissa länge.
 */

/** Håller bromsen åtskild från plattformsinloggningens. */
const THROTTLE_SCOPE = "admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },

  pages: {
    signIn: "/admin/login",
  },

  providers: [
    Credentials({
      credentials: {
        email: { label: "E-post", type: "email" },
        password: { label: "Lösenord", type: "password" },
      },

      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");

        if (!email || !password) return null;

        // Kontrolleras före uppslaget. Är adressen låst ska ingen tid läggas
        // på att jämföra lösenord — det är hela poängen med spärren.
        if (isLockedOut(THROTTLE_SCOPE, email)) return null;

        const user = await unsafeGlobalPrisma.adminUser.findUnique({
          where: { email },
          include: { company: { select: { id: true, name: true } } },
        });

        // Vi kör jämförelsen även när kontot saknas, mot en känd hash. Annars
        // skulle svarstiden avslöja vilka e-postadresser som finns i systemet.
        const hash = user?.passwordHash ?? UNKNOWN_USER_HASH;
        const correct = await bcrypt.compare(password, hash);

        if (!user || !correct) {
          noteFailedLogin(THROTTLE_SCOPE, email);
          return null;
        }

        clearFailedLogins(THROTTLE_SCOPE, email);

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
      return session;
    },
  },
});

/**
 * En riktig hash av ett lösenord ingen har. Finns bara för att jämförelsen ska
 * ta lika lång tid oavsett om kontot existerar — en påhittad sträng hade
 * avvisats direkt och därmed avslöjat skillnaden ändå.
 *
 * Räknas ut en gång när appen startar.
 */
const UNKNOWN_USER_HASH = bcrypt.hashSync(
  "det-har-losenordet-tillhor-ingen",
  12
);
