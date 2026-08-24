import { requirePlatformAdmin } from "@/lib/platform-admin";
import { broadcastRecipients } from "@/lib/platform-broadcast";
import { emailIsConfigured } from "@/lib/email";
import PlatformShell from "@/components/platform/PlatformShell";
import BroadcastForm from "@/components/platform/BroadcastForm";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Utskick — Tikkr Plattform" };

/**
 * MASSUTSKICK TILL ADMINISTRATÖRER.
 *
 * Egen sida, skild från driftmeddelandena. De löser olika problem: bannern når
 * den som råkar vara inloggad, mejlet når den som inte är det. Att ha dem på
 * samma sida gjorde att man fick skrolla förbi det ena för att hitta det
 * andra, och ett utskick är inget man vill råka hamna i.
 */
export default async function BroadcastPage() {
  const { email } = await requirePlatformAdmin();

  const [all, paying, trialing] = await Promise.all([
    broadcastRecipients("all"),
    broadcastRecipients("paying"),
    broadcastRecipients("trialing"),
  ]);

  return (
    <PlatformShell email={email} current="/plattform/utskick">
      <PageHeader
        title="Utskick"
        description="Mejl till kundernas administratörer. Avsett för driftinformation."
      />

      {emailIsConfigured() ? (
        <Card>
          <CardHeader
            title="Nytt utskick"
            description="Ett separat mejl per mottagare. Adresserna syns inte för varandra."
          />
          <BroadcastForm
            counts={{
              all: all.length,
              paying: paying.length,
              trialing: trialing.length,
            }}
          />
        </Card>
      ) : (
        <Alert tone="warning">
          E-post är inte konfigurerad för installationen. Utskick kräver
          MAIL_PROVIDER i .env.
        </Alert>
      )}

      <p className="mt-6 text-xs leading-relaxed text-neutral-500">
        Marknadsföring kräver annan rättslig grund och omfattas inte av
        funktionen.
      </p>
    </PlatformShell>
  );
}
