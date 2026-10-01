import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getOrderExports, slugify } from "@/lib/order-export";
import { getOrderCalcs } from "@/lib/order-calc";
import { buildOrderPdf, type PdfCompany } from "@/lib/pdf";
import { buildOrderCalcPdf } from "@/lib/calc-pdf";
import { formatDate } from "@/lib/format";
import { buildZip, uniqueName } from "@/lib/zip";

/**
 * Underlag per order, som PDF.
 *
 * Dokumentet man bifogar en faktura: en order per sida, med kundens logotyp
 * överst och summan sist.
 *
 * BARA PDF (ändrat 2026-10-01). Båda dokumenten fanns också som Excel-filer,
 * och kunden använde dem inte. Underlaget bifogas en faktura och kalkylen
 * läses på ett bord; ett kalkylark är varken det ena eller det andra.
 * Rapportexporten under /api/admin/export är kvar som Excel, eftersom den är
 * till för att räkna vidare i.
 *
 * Kalkyl är något annat: ett INTERNT underlag med självkostnad, påslag och
 * pris. Det har egen datahämtning (order-calc.ts) och egen ritning
 * (calc-pdf.ts), och delar inte en rad med de två andra. Se toppkommentaren i
 * calc-pdf.ts för varför de hålls isär.
 *
 * FLERA MARKERADE ORDRAR GER EN FIL PER ORDER, i ett zip-arkiv (ändrat
 * 2026-09-29). Tidigare gavs ett dokument med en sida per order, med skälet
 * att tio filer blir tio bilagor att hålla reda på. Det var fel håll:
 * underlagen bifogas tio OLIKA fakturor till tio olika kunder, och då är det
 * den som fakturerar som får klippa isär dokumentet. Arkivet packas upp en
 * gång; uppdelningen behövde göras varje gång.
 *
 * UNDANTAGET ÄR UTSKRIFT. `visa=1` lämnar ut dokumentet för visning i stället
 * för nedladdning, och då är en sammanhållen PDF hela poängen: den går till
 * skrivaren i ett svep. Se PrintButton i panelen.
 */

export const runtime = "nodejs";

/**
 * Rubriken som avgör om webbläsaren laddar ner filen eller visar den.
 *
 * Utskriftsknappen laddar dokumentet i en dold ram och ber webbläsaren skriva
 * ut det. En fil som kommer som `attachment` hamnar då i nedladdningsmappen i
 * stället för i skrivardialogen.
 */
function disposition(inline: boolean, fileName: string): string {
  return `${inline ? "inline" : "attachment"}; filename="${fileName}"`;
}

export async function GET(request: NextRequest) {
  const { db, companyId, companyName } = await requireAdmin();
  const params = request.nextUrl.searchParams;

  // BARA PDF (ändrat 2026-10-01). Underlaget och efterkalkylen fanns också
  // som Excel-filer. Kunden använde dem inte: dokumenten är gjorda för att
  // bifogas en faktura respektive läsas på ett bord, och ett kalkylark är
  // varken det ena eller det andra. Rapportexporten är kvar som Excel, för
  // den är till för att räkna vidare i.
  const format = params.get("format") === "kalkyl" ? "kalkyl" : "pdf";
  const orderIds = params.getAll("order").filter(Boolean);

  // Visning i stället för nedladdning. Sätts av utskriftsknappen, som behöver
  // ett sammanhållet dokument att skicka till skrivaren.
  const inline = params.get("visa") === "1";

  if (orderIds.length === 0) {
    return NextResponse.json({ error: "Ingen order vald." }, { status: 400 });
  }

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: {
      timezone: true,
      // Standardpåslaget. Ordern kan ha ett eget som gäller före detta.
      markupPercent: true,
      // Bara den breda används på utskrifter. Märket i panelen är fyrkantigt
      // och skulle bli en klump i ett brevhuvud.
      logoWideData: true,
      logoWideMimeType: true,
    },
  });

  const timeZone = company?.timezone ?? "Europe/Stockholm";

  const logo =
    company?.logoWideData && company.logoWideMimeType
      ? {
          data: Buffer.from(company.logoWideData),
          mimeType: company.logoWideMimeType,
        }
      : null;

  /* --- Kalkyl: eget spår hela vägen --------------------------------------- */

  if (format === "kalkyl") {
    const calcs = await getOrderCalcs(
      db,
      orderIds,
      company?.markupPercent ?? 100
    );

    if (calcs.length === 0) {
      return NextResponse.json(
        { error: "Hittade ingen order." },
        { status: 404 }
      );
    }

    // Filnamnet säger vad filen är. Ett "order-1001.pdf" i mappen bredvid ett
    // annat "order-1001.pdf" är precis den förväxling som inte får ske här.
    const calcBase =
      calcs.length === 1
        ? `efterkalkyl-${slugify(calcs[0].orderNumber)}`
        : `efterkalkyler-${slugify(companyName)}-${formatDate(new Date(), timeZone)}`;

    try {
      // Flera ordrar blir ett arkiv med en kalkyl per order. Vid utskrift
      // blir de i stället ett dokument, eftersom en zip inte går att skicka
      // till en skrivare.
      if (calcs.length > 1 && !inline) {
        const taken = new Set<string>();
        const files: { name: string; data: Buffer }[] = [];

        for (const calc of calcs) {
          files.push({
            name: uniqueName(
              taken,
              `efterkalkyl-${slugify(calc.orderNumber)}`,
              "pdf"
            ),
            data: await buildOrderCalcPdf(
              { name: companyName, timezone: timeZone, logo },
              [calc]
            ),
          });
        }

        return zipResponse(files, calcBase);
      }

      const pdf = await buildOrderCalcPdf(
        { name: companyName, timezone: timeZone, logo },
        calcs
      );

      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": disposition(inline, `${calcBase}.pdf`),
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      console.error("Efterkalkylen kunde inte skapas", error);

      return NextResponse.json(
        {
          error:
            "Efterkalkylen kunde inte skapas. Felet står i serverloggen.",
        },
        { status: 500 }
      );
    }
  }

  /* --- Tidsunderlag som PDF ----------------------------------------------- */

  // Både öppna och stängda ordrar går att exportera. En färdig order är ofta
  // den man vill titta på — "hur lång tid tog ett liknande jobb förra gången"
  // är hela poängen med att spara tiden.
  // BELOPP ÄR ETT VAL VID UTTAGET, inte ett läge på kunden. Utan kryss ser
  // underlaget ut precis som förut — bara tid. Den som ska visa hur många
  // timmar ett jobb tog behöver inte skicka med ett pris.
  const withPrice = params.get("belopp") === "1";

  const orders = await getOrderExports(db, orderIds, {
    withPrice,
    companyMarkupPercent: company?.markupPercent ?? 100,
  });

  if (orders.length === 0) {
    return NextResponse.json({ error: "Hittade ingen order." }, { status: 404 });
  }

  const fileBase =
    orders.length === 1
      ? `order-${slugify(orders[0].orderNumber)}`
      : `ordrar-${slugify(companyName)}-${formatDate(new Date(), timeZone)}`;

  const pdfCompany: PdfCompany = {
    name: companyName,
    timezone: timeZone,
    logo,
  };

  try {
    // Samma regel som för kalkylen: en fil per order när flera markerats, ett
    // sammanhållet dokument när det ska skrivas ut.
    if (orders.length > 1 && !inline) {
      const taken = new Set<string>();
      const files: { name: string; data: Buffer }[] = [];

      for (const order of orders) {
        files.push({
          name: uniqueName(taken, `order-${slugify(order.orderNumber)}`, "pdf"),
          data: await buildOrderPdf(pdfCompany, [order]),
        });
      }

      return zipResponse(files, fileBase);
    }

    const pdf = await buildOrderPdf(pdfCompany, orders);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": disposition(inline, `${fileBase}.pdf`),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    // Ett tyst fel här ser ut som att knappen inte gör något. Skriv ut det som
    // faktiskt hände i loggen och svara med något begripligt.
    console.error("PDF kunde inte skapas", error);

    return NextResponse.json(
      {
        error:
          "PDF:en kunde inte skapas. Felet står i serverloggen.",
      },
      { status: 500 }
    );
  }
}

/** Arkivet med en fil per order. Alltid en nedladdning. */
function zipResponse(
  files: { name: string; data: Buffer }[],
  fileBase: string
): NextResponse {
  const archive = buildZip(files);

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${fileBase}.zip"`,
      "cache-control": "no-store",
    },
  });
}
