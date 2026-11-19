import { Badge } from "@/components/ui";
import { INTEGRATION_STATE_LABEL, type IntegrationState } from "@/lib/integrations/status";

/** Ansluten i grönt, fel och väntan i gult, ej ansluten i grått. */
export default function IntegrationStatusBadge({ state }: { state: IntegrationState }) {
  const tone = state === "connected" ? "active" : state === "not-connected" ? "muted" : "warning";
  return <Badge tone={tone}>{INTEGRATION_STATE_LABEL[state]}</Badge>;
}
