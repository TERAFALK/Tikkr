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
          description="Vad som händer när någon glömmer stämpla ut."
        />

        <div className="space-y-5 p-5">
          <Alert tone="info">
            Vid klockslaget nedan stängs alla stämplingar som fortfarande är
            öppna. Posten <strong>flaggas för granskning</strong> och dyker upp
            under Granskning — systemet gissar sluttiden för att underlaget ska
            gå att använda, men talar alltid om att det gissat.
            <span className="mt-1.5 block">
              Stämplar någon in <em>efter</em> klockslaget stängs posten först
              nästa dygn. Kvälls- och nattskift avbryts alltså inte.
            </span>
          </Alert>

          <form action={saveTimeSettings} className="max-w-md space-y-4">
            <Field
              label="Stäng glömda stämplingar klockan"
              hint="Skrivs som HH:MM. Har du skiftarbete, sätt klockslaget till en tid då ingen normalt arbetar — till exempel 02:00."
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
              hint="Avgör vad klockslaget ovan betyder. Utan rätt tidszon glider tiden en timme vid sommar- och vintertid."
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
