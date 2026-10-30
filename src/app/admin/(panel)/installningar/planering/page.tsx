import { requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { planningModeOf } from "@/lib/planning";
import { PLANNING_MODES, PLANNING_MODE_KEYS } from "@/lib/planning-modes";
import SaveForm from "@/components/admin/SaveForm";
import { Card, CardHeader } from "@/components/ui";
import { savePlanningMode } from "./actions";

export const metadata = { title: "Planeringsläge · Tikkr" };

/**
 * PLANERINGSLÄGET (tillagt 2026-10-14, issue #21).
 *
 * Verkstaden planerar ordrar på stationer, elfirman planerar personal på jobb.
 * Läget avgör vilka vyer tavlan har; se src/lib/planning-modes.ts för vad det
 * betyder i räkningen.
 */

export const dynamic = "force-dynamic";

export default async function PlanningSettingsPage() {
  const session = await requireAdmin();
  await requireModule(session, "PLANNING");

  const current = await planningModeOf(session.companyId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Planeringsläge" help="planering" />

        <SaveForm action={savePlanningMode}>
          <fieldset className="space-y-3">
            <legend className="sr-only">Planeringsläge</legend>

            {PLANNING_MODE_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-2.5 text-[13px]"
              >
                <input
                  type="radio"
                  name="planningMode"
                  value={key}
                  defaultChecked={current === key}
                  className="mt-0.5 h-3.5 w-3.5 border-neutral-400 text-blue-600 focus:ring-blue-600"
                />
                <span>
                  <span className="block font-medium text-neutral-900">
                    {PLANNING_MODES[key].name}
                  </span>
                  <span className="block text-neutral-500">
                    {PLANNING_MODES[key].summary}
                  </span>
                </span>
              </label>
            ))}

            <p className="text-xs text-neutral-500">
              Planerad tid ligger kvar vid byte av läge
            </p>
          </fieldset>
        </SaveForm>
      </Card>
    </div>
  );
}
