import type { NoticeKind } from "@/lib/notices";

/**
 * Vad bannern behöver veta.
 *
 * Avsiktligt mindre än modellen i databasen: tiderna styr OM meddelandet ska
 * visas, inte hur det ser ut, och de har redan gjort sitt jobb när det kommer
 * hit. Kioskskärmen kan därför skicka in det den fått utan att fylla i datum
 * den inte har.
 */
export interface BannerNotice {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
}

/**
 * DRIFTMEDDELANDET SOM KUNDEN SER.
 *
 * Samma komponent i adminpanelen och på stämplingsskärmen, men i två storlekar.
 * Skärmen läses på flera meters avstånd av någon med handskar på; panelen läses
 * av någon som sitter framför den.
 *
 * Ingen stängknapp. Ett meddelande om ett pågående avbrott ska inte gå att
 * klicka bort — den som stänger det klockan åtta minns det inte klockan tio,
 * och ringer supporten i stället.
 */

const TONES = {
  INCIDENT: {
    wrapper: "border-amber-200 bg-amber-50",
    title: "text-amber-900",
    body: "text-amber-800",
    dot: "bg-amber-500",
  },
  /*
    Planerat underhåll är den tystaste av de tre, men får inte se ut som ett
    informationsmeddelande.

    Tonen är Fjord: fastare ram, en aning mörkare yta och en Fjord-punkt, mot
    INFO:s Snö-yta och gråa punkt. Den syns utan att ta plats, vilket är rätt
    för ett besked om något som ska hända och inte om något som är fel.

    Att göra den grön vore att låna "pågår just nu" till ett läge som inte
    pågår, och grönt ligger dessutom närmast "allt är bra" för den som läser
    snabbt.
  */
  MAINTENANCE: {
    wrapper: "border-blue-300 bg-blue-100",
    title: "text-blue-900",
    body: "text-blue-700",
    dot: "bg-blue-600",
  },
  INFO: {
    wrapper: "border-neutral-200 bg-neutral-50",
    title: "text-neutral-900",
    body: "text-neutral-600",
    dot: "bg-neutral-400",
  },
} as const;

export default function NoticeBanner({
  notices,
  size = "panel",
}: {
  notices: BannerNotice[];
  size?: "panel" | "kiosk";
}) {
  if (notices.length === 0) return null;

  const kiosk = size === "kiosk";

  return (
    <div className={kiosk ? "space-y-2 px-4 pt-4 sm:px-6" : "space-y-2"}>
      {notices.map((notice) => {
        const tone = TONES[notice.kind] ?? TONES.INFO;

        return (
          <div
            key={notice.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${tone.wrapper}`}
          >
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot} ${
                notice.kind === "INCIDENT" ? "animate-breathe" : ""
              }`}
              aria-hidden="true"
            />

            <div className="min-w-0">
              <p
                className={`font-semibold ${tone.title} ${
                  kiosk ? "text-lg" : "text-sm"
                }`}
              >
                {notice.title}
              </p>
              <p
                className={`mt-0.5 leading-relaxed ${tone.body} ${
                  kiosk ? "text-base" : "text-[13px]"
                }`}
              >
                {notice.body}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
