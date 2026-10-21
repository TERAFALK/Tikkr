import type { ReactNode } from "react";
import { openFeedbackCount } from "@/lib/feedback";
import { shopAttentionCount } from "@/lib/shop/admin";
import PlatformFrame from "./PlatformFrame";

/**
 * RAM RUNT PLATTFORMSPANELEN, serverdelen.
 *
 * Hämtar siffrorna vid Inkorg och Beställningar och lämnar resten till PlatformFrame, som är en
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
  const [inboxCount, ordersCount] = await Promise.all([
    openFeedbackCount(),
    shopAttentionCount(),
  ]);

  return (
    <PlatformFrame email={email} inboxCount={inboxCount} ordersCount={ordersCount}>
      {children}
    </PlatformFrame>
  );
}
