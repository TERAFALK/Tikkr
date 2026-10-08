import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import SaveForm from "@/components/admin/SaveForm";
import {
  Alert,
  Card,
  CardHeader,
  Field,
  Select,
  TimeField,
} from "@/components/ui";
import { saveTimeSettings } from "../actions";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/London",
  "UTC",
];

export default async function TimeSettingsPage() {
  const { companyId, db } = await requireAdmin();

  const [company, openRightNow] = await Promise.all([
    unsafeGlobalPrisma.company.findUnique({
      where: { id: companyId },
      select: { autoCloseAt: true, timezone: true },
    }),
    db.timeEntry.count({ where: { clockOutAt: null } }),
  ]);

  if (!company) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Automatisk utstämpling"
        />

        <div className="space-y-5 p-5">
          <Alert tone="info">
            Vid klockslaget stängs stämplingar som fortfarande är öppna. Posten
            flaggas för granskning, och sluttiden är markerad som beräknad.
            Stämplingar som påbörjas efter klockslaget stängs först nästa dygn.
          </Alert>

          <SaveForm action={saveTimeSettings} className="max-w-md space-y-4">
            <Field
              label="Stäng glömda stämplingar klockan"
              hint="Välj en tid då ingen arbetar"
            >
              <TimeField
                name="autoCloseAt"
                defaultValue={company.autoCloseAt}
                placeholder="18:00"
                required
              />
            </Field>

            <Field
              label="Tidszon"
            >
              <Select name="timezone" defaultValue={company.timezone}>
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>
          </SaveForm>
        </div>

        {/* LÄGET JUST NU STÅR I SAMMA RUTA som klockslaget det gäller. Det låg
            i en egen ruta med egen rubrik, alltså en ram och en skärmhöjd för
            en enda rad text. */}
        <div className="border-t border-neutral-200 px-5 py-3.5 text-[13px] text-neutral-600">
          {openRightNow === 0 ? (
            <p>Inga öppna stämplingar just nu.</p>
          ) : (
            <p>
              <strong className="tabular-nums text-neutral-900">
                {openRightNow}
              </strong>{" "}
              {openRightNow === 1 ? "stämpling är" : "stämplingar är"} öppna just
              nu. De stängs {company.autoCloseAt} om ingen stämplar ut innan
              dess.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
