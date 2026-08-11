import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-neutral-50 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">
          Tikkr
        </h1>
        <p className="mt-2 text-[15px] text-neutral-500">
          Stämplingssystem för verkstad och tillverkning
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/kiosk"
          className="rounded-xl bg-neutral-900 px-8 py-4 text-lg font-semibold text-white transition-transform active:scale-[0.98]"
        >
          Stämplingsskärmen
        </Link>
        <Link
          href="/admin"
          className="rounded-xl border border-neutral-200 bg-white px-8 py-4 text-lg font-semibold text-neutral-900 transition-colors active:bg-neutral-100"
        >
          Adminpanelen
        </Link>
      </div>

      <div className="max-w-md rounded-xl border border-neutral-200 bg-white px-6 py-4 text-[13px] leading-relaxed text-neutral-500">
        <p className="font-medium text-neutral-900">Så kommer du igång</p>
        <p className="mt-1">
          Logga in i adminpanelen, lägg upp anställda, ordrar och arbetsmoment.
          Skapa sedan en skärm under Skärmar och öppna dess kopplingslänk en gång
          på surfplattan som ska stå i verkstaden.
        </p>
      </div>
    </main>
  );
}
