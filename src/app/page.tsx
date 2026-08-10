import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">Tikkr</h1>
        <p className="mt-3 text-lg text-slate-600">
          Stämplingssystem för verkstad och tillverkning
        </p>
      </div>

      <Link
        href="/kiosk"
        className="rounded-2xl bg-slate-900 px-8 py-5 text-xl font-semibold text-white active:scale-[0.98]"
      >
        Öppna stämplingsskärmen
      </Link>

      <div className="max-w-md rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
        <p className="font-medium text-slate-900">Fas 1 — kioskskärmen</p>
        <p className="mt-1">
          Skärmen måste kopplas en gång innan den kan användas. Kör
          testdata-skriptet på servern, så skrivs kopplingslänken ut.
        </p>
        <p className="mt-2">
          Adminpanelen byggs i Fas 2. Fram till dess läggs anställda, ordrar och
          moment in med testdata-skriptet.
        </p>
      </div>
    </main>
  );
}
