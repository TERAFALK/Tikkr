import { handlers } from "@/lib/auth";

// Auth.js egna adresser för inloggning och utloggning.
// bcrypt kräver Node — den fungerar inte i Edge-miljön.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
