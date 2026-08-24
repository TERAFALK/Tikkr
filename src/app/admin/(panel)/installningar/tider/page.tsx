import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
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
          description="Hantering av stämplingar utan registrerad utstämpling."
        />

        <div className="space-y-5 p-5">
          <Alert tone="info">
            Vid angivet klockslag stängs stämplingar som fortfarande är
            öppna. Posten <strong>flaggas för granskning</strong> och visas
            under Granskning. Den beräknade sluttiden är alltid markerad som
            sådan.
            <span className="mt-1.5 block">
              Stämplingar som påbörjas efter klockslaget stängs först nästa dygn, vilket gör att kvälls- och nattskift inte avbryts.
            </span>
          </Alert>

          <form action={saveTimeSettings} className="max-w-md space-y-4">
            <Field
              label="Stäng glömda stämplingar klockan"
              hint="HH:MM. Vid skiftarbete, välj en tid då ingen arbetar."
            >
              <Input
                name="autoCloseAt"
                defaultValue={company.autoCloseAt}
                placeholder="18:00"
                pattern="[0-9]{1,2}:[0-9]{2}"
                required
              />
            </Field>

            <Field
              label="Tidszon"
              hint="Avgör hur klockslaget tolkas vid sommar- och vintertid."
            >
              <Select name="timezone" defaultValue={company.timezone}>
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>

            <Button type="submit">Spara</Button>
          </form>
        </div>
      </Card>

      <Card>
        <CardHeader title="Läge just nu" />
        <div className="p-5 text-[13px] text-neutral-600">
          {openRightNow === 0 ? (
            <p>Inga öppna stämplingar. Ingen berörs av inställningen just nu.</p>
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
