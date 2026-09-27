import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  PRICE_ITEMS,
  priceBook,
  priceEnvName,
  priceFromEnv,
  SCREEN_ITEM,
  storedPrices,
} from "@/lib/price-book";
import { MODULES, MODULE_KEYS, isModuleKey } from "@/lib/modules";
import { hasStripeKey } from "@/lib/stripe";
import PlatformShell from "@/components/platform/PlatformShell";
import PriceForm from "@/components/platform/PriceForm";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Artiklar · Tikkr" };

/**
 * VILKA ARTIKLAR HOS STRIPE SOM ÄR VAD.
 *
 * Numren stod först i miljövariabler. En ny artikel krävde då att någon
 * redigerade en fil på servern och startade om appen, för att skriva in en
 * identifierare som inte ens är hemlig.
 *
 * Miljövariablerna läses fortfarande som reserv, och det visas per fält. En
 * administratör som ser ett nummer i ett tomt fält ska förstå varifrån det
 * kommer, annars ser det ut som att sidan ljuger.
 */
export default async function PricesPage() {
  const { email } = await requirePlatformAdmin();

  const stored = new Map((await storedPrices()).map((row) => [row.item, row]));
  const keyPresent = hasStripeKey();

  const book = await priceBook();

  // En modul utan årsartikel gör att INGEN kund kan välja årsbetalning med
  // den påslagen. Det märks annars först den dag en kund försöker, och då
  // som ett uteblivet val de inte kan förklara.
  const missingYearly = book.screen.year
    ? MODULE_KEYS.filter((key) => !book.modules[key].year).map(
        (key) => MODULES[key].name
      )
    : [];

  const rows = PRICE_ITEMS.map((item) => {
    const row = stored.get(item);

    return {
      item,
      label: item === SCREEN_ITEM ? "Stämplingsskärm" : labelFor(item),
      note:
        item === SCREEN_ITEM
          ? "Per licens och månad. Krävs för att kunden ska kunna betala."
          : "Fast pris per företag.",
      month: row?.month ?? "",
      year: row?.year ?? "",
      envMonth: priceFromEnv(item, "month") ?? null,
      envYear: priceFromEnv(item, "year") ?? null,
      envNameMonth: priceEnvName(item, "month"),
      envNameYear: priceEnvName(item, "year"),
      updatedByEmail: row?.updatedByEmail ?? null,
    };
  });

  return (
    <PlatformShell email={email} current="/plattform/artiklar">
      <PageHeader title="Artiklar" />

      {!keyPresent && (
        <Alert tone="warning">
          STRIPE_SECRET_KEY saknas. Numren går att spara men kontrolleras inte,
          och ingen kund kan betala med kort.
        </Alert>
      )}

      {missingYearly.length > 0 && (
        <Alert tone="warning">
          Årsbetalning erbjuds för stämplingsskärmar men saknar artikel för{" "}
          {missingYearly.join(", ")}. Kunder med tillvalet påslaget kan därför
          bara betala månadsvis.
        </Alert>
      )}

      <div className="mt-6 space-y-6">
        {rows.map((row) => (
          <Card key={row.item}>
            <CardHeader title={row.label} description={row.note} />
            <div className="p-5">
              <PriceForm
                item={row.item}
                month={row.month}
                year={row.year}
                envMonth={row.envMonth}
                envYear={row.envYear}
                envNameMonth={row.envNameMonth}
                envNameYear={row.envNameYear}
                updatedByEmail={row.updatedByEmail}
              />
            </div>
          </Card>
        ))}

        <Card>
          <CardHeader title="Så hänger det ihop" />
          <div className="space-y-2 p-5 text-[13px] leading-relaxed text-neutral-600">
            <p>
              Numret pekar ut en artikel hos Stripe. Beloppet i kronor står
              bara där, och ändras det följer Tikkr med inom tio minuter.
            </p>
            <p>
              Ett tomt fält betyder att miljövariabeln används om den finns.
              Saknas båda går saken inte att köpa, och resten av
              prenumerationen fungerar som förut.
            </p>
            <p>
              Artikeln måste vara återkommande och ligga i rätt intervall.
              Fälten byter inte plats på egen hand, men ett årspris i
              månadsfältet vägras.
            </p>
          </div>
        </Card>
      </div>
    </PlatformShell>
  );
}

function labelFor(item: string): string {
  return isModuleKey(item) ? MODULES[item].name : item;
}
