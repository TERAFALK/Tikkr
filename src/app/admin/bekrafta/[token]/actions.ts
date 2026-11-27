"use server";

import { redirect } from "next/navigation";
import { confirmEmail } from "@/lib/email-verification";

/**
 * Knappen på sidan bakom länken i mejlet.
 *
 * Kräver ingen inloggning: länken öppnas ofta i en annan webbläsare än den man
 * är inloggad i, eller i telefonen. Beviset är länken själv, som bara gått till
 * den adress som ska bekräftas.
 *
 * Utfallet läses om av sidan, som säger "bekräftad" även när någon annan hann
 * före. Se linkState i email-verification.ts.
 */
export async function confirmEmailLink(token: string) {
  await confirmEmail(token);
  redirect(`/admin/bekrafta/${encodeURIComponent(token)}`);
}
