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
