import type { DefaultSession } from "next-auth";

// Talar om för TypeScript att vår session bär med sig företag och roll utöver
// standardfälten. Utan detta vet koden inte att session.user.companyId finns.

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      companyId: string;
      companyName: string;
      role: string;
      /**
       * När sessionen utfärdades, i sekunder.
       *
       * Jämförs mot kontots passwordChangedAt, så att ett lösenordsbyte gör
       * äldre sessioner ogiltiga. Se currentAdmin() i src/lib/admin-session.ts.
       */
      issuedAt?: number;
    } & DefaultSession["user"];
  }

  interface User {
    companyId: string;
    companyName: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    companyId?: string;
    companyName?: string;
    role?: string;
  }
}
