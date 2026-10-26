import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  KIOSK_SETTINGS,
  KIOSK_SETTING_KEYS,
  isKioskSettingKey,
  resolveKioskSettings,
  type KioskSettingKey,
} from "@/lib/kiosk-settings";
import { storedKioskDefaults } from "@/lib/kiosk-settings-store";
import KioskSettingsList from "@/components/platform/KioskSettingsList";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { saveKioskDefault } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Skärmar · Tikkr" };

/**
 * INSTÄLLNINGARNA PÅ ALLA SKÄRMAR VI SÅLT.
 *
 * Svarar på frågan hur skärmarna ute hos kunderna beter sig, och ändrar det
 * för alla på en gång. En kund som ska ha något annat får ett eget värde på
 * sin sida under Kunder, och står listad här.
 *
 * Bara skärmar som kör kioskappen påverkas. En kunds egen dator rapporterar
 * ingen app och får inga inställningar.
 */
export default async function KioskSettingsPage() {
  await requirePlatformAdmin();

  const [stored, sold, overrides] = await Promise.all([
    storedKioskDefaults(),
    unsafeGlobalPrisma.kioskDevice.count({
      where: { fullyVersion: { not: null } },
    }),
    unsafeGlobalPrisma.companyKioskSetting.findMany({
      select: {
        key: true,
        value: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { company: { name: "asc" } },
    }),
  ]);

  const effective = resolveKioskSettings(stored, {});

  const rows = KIOSK_SETTING_KEYS.map((key) => ({
    key,
    value: effective[key],
    own: key in stored ? stored[key] : null,
  }));

  return (
    <>
      <PageHeader title="Skärmar" />

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader
            title="Standard för alla skärmar"
            description={`${sold} ${sold === 1 ? "skärm" : "skärmar"} kör kioskappen. En ändring når dem inom några sekunder.`}
          />
          <KioskSettingsList
            rows={rows}
            action={saveKioskDefault}
            inheritedLabel="Tikkrs standard"
            emptyHint="Tomt ger Tikkrs standard"
          />
        </Card>

        <Card>
          <CardHeader title="Kunder med egna värden" />
          {overrides.length === 0 ? (
            <p className="p-5 text-[13px] text-neutral-500">
              Ingen. Alla skärmar följer standarden.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {overrides.filter((row) => isKioskSettingKey(row.key)).map((row) => (
                <li
                  key={`${row.company.id}-${row.key}`}
                  className="flex flex-wrap items-center gap-x-3 px-5 py-3 text-[13px]"
                >
                  <Link
                    href={`/plattform/kunder/${row.company.id}`}
                    className="min-w-0 flex-1 font-medium text-neutral-900 hover:underline"
                  >
                    {row.company.name}
                  </Link>
                  <span className="text-neutral-500">
                    {KIOSK_SETTINGS[row.key as KioskSettingKey].label}
                  </span>
                  <span className="tabular-nums text-neutral-900">
                    {KIOSK_SETTINGS[row.key as KioskSettingKey].describe(row.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
