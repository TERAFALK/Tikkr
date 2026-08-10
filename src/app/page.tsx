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

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/kiosk"
          className="rounded-2xl bg-slate-900 px-8 py-5 text-xl font-semibold text-white active:scale-[0.98]"
        >
          Stämplingsskärmen
        </Link>
        <Link
          href="/admin"
          className="rounded-2xl bg-white px-8 py-5 text-xl font-semibold text-slate-900 ring-1 ring-slate-300 active:scale-[0.98]"
        >
          Adminpanelen
        </Link>
      </div>

      <div className="max-w-md rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
        <p className="font-medium text-slate-900">Så kommer du igång</p>
        <p className="mt-1">
          Logga in i adminpanelen, lägg upp anställda, ordrar och arbetsmoment.
          Skapa sedan en skärm under Skärmar och öppna dess kopplingslänk en gång
          på surfplattan som ska stå i verkstaden.
        </p>
      </div>
    </main>
  );
}
