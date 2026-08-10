export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">Tikkr</h1>
        <p className="mt-3 text-lg text-slate-600">
          Stämplingssystem för verkstad och tillverkning
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
        <p className="font-medium text-slate-900">Fas 0 — grundstruktur</p>
        <p className="mt-1">
          Systemet är uppsatt. Stämplingsskärmen byggs i Fas 1 och adminpanelen i
          Fas 2.
        </p>
      </div>
    </main>
  );
}
