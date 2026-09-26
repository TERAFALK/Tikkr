import { endSupport } from "@/app/plattform/[companyId]/actions";

/**
 * BANNERN SOM SÄGER ATT DU INTE ÄR KUNDEN.
 *
 * Visas högst upp i adminpanelen under ett supportbesök, och går inte att
 * stänga. Skälet: den som glömmer vilket läge hen är i börjar felsöka fel sak —
 * "varför kan jag inte spara" är en fråga man ställer i tio minuter innan man
 * inser svaret.
 *
 * Rött och inte gult. Gult läses som en upplysning; det här är ett läge man ska
 * lämna när man är klar.
 *
 * Kundens namn skrivs ut. En banner som bara säger "supportläge" räcker inte
 * när man haft tre kunder uppe samma förmiddag.
 */
export default function SupportBanner({
  companyName,
}: {
  companyName: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-red-600 px-4 py-2.5 text-white">
      <p className="text-[13px]">
        <span className="font-semibold">Supportläge.</span> Du ser{" "}
        <span className="font-semibold">{companyName}</span> som läsning.
        Ingenting du gör sparas, och besöket loggas.
      </p>

      <form action={endSupport}>
        <button
          type="submit"
          className="rounded-md bg-white/15 px-3 py-1 text-[13px] font-medium text-white ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/25"
        >
          Avsluta support
        </button>
      </form>
    </div>
  );
}
