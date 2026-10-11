import type { ReactNode } from "react";
import { newFeedbackCount } from "@/lib/feedback";
import PlatformFrame from "./PlatformFrame";

/**
 * RAM RUNT PLATTFORMSPANELEN, serverdelen.
 *
 * Hämtar siffran vid Inkorg och lämnar resten till PlatformFrame, som är en
 * klientkomponent för menyns skull. Siffran hämtas här och inte av varje sida,
 * så att den står likadant var man än är i panelen.
 */
export default async function PlatformShell({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  const inboxCount = await newFeedbackCount();

  return (
    <PlatformFrame email={email} inboxCount={inboxCount}>
      {children}
    </PlatformFrame>
  );
}
