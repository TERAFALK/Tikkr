import Link from "next/link";
import { Wordmark } from "@/components/ui/Logo";
import { IconClock, IconReport, IconDevice } from "@/components/ui/icons";

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Wordmark size={32} />
          <Link
            href="/admin/login"
            className="text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
          >
            Logga in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Tidregistrering som faktiskt blir gjord
          </h1>
          <p className="mt-4 text-base leading-relaxed text-neutral-600">
            Ett tryck på skärmen i verkstaden, så vet du hur mycket tid som lagts
            på varje order. Ingen PIN-kod, inga blanketter, ingen som sitter och
            gissar på fredagen.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/registrera"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Kom igång — 30 dagar fritt
            </Link>
            <Link
              href="/kiosk"
              className="rounded-lg border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Öppna stämplingsskärmen
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          <Feature
            icon={<IconClock />}
            title="Ett tryck räcker"
            body="Namn, order, moment. Byter någon jobb stämplas det förra ut automatiskt — ingen kan råka ligga på två ordrar samtidigt."
          />
          <Feature
            icon={<IconDevice />}
            title="Fungerar utan nät"
            body="Hackar wifit sparas stämplingen i skärmen och skickas när nätet är tillbaka, med den tid den faktiskt gjordes."
          />
          <Feature
            icon={<IconReport />}
            title="Underlag att fakturera på"
            body="Tid per order, person och moment. Export till Excel med riktiga timmar som går att räkna vidare på."
          />
        </div>

        <div className="mt-16 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-neutral-900">
            Så kommer du igång
          </h2>
          <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-neutral-600">
            <li>
              <strong className="font-medium text-neutral-900">1.</strong> Skapa
              en arbetsyta och lägg upp anställda, ordrar och arbetsmoment.
            </li>
            <li>
              <strong className="font-medium text-neutral-900">2.</strong> Skapa
              en skärm under Skärmar och öppna dess länk en gång på surfplattan
              som ska stå i verkstaden.
            </li>
            <li>
              <strong className="font-medium text-neutral-900">3.</strong> Klart.
              Skärmen behöver aldrig loggas in igen.
            </li>
          </ol>
        </div>
      </main>

      <footer className="border-t border-neutral-200 py-8">
        <p className="mx-auto max-w-4xl px-6 text-xs text-neutral-400">
          Tikkr · Tidregistrering för verkstad och tillverkning
        </p>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500">
        {icon}
      </span>
      <h3 className="mt-3 text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">{body}</p>
    </div>
  );
}
