// Testdata så att det finns något att titta på direkt.
//
// Två företag med avsiktligt likartad data — det gör att man med blotta ögat
// kan se att multi-tenant-isoleringen fungerar när kiosken byggs i Fas 1.
//
// Skriven i vanlig JavaScript, inte TypeScript, så att den kan köras direkt i
// appcontainern. Den färdiga imagen innehåller medvetet inga byggverktyg.
//
// Kör: docker compose exec app node prisma/seed.mjs

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Fast kopplingskod för testskärmen, så att den är densamma varje gång du kör
 * seed. Koden gäller i hundra år i stället för fem minuter.
 *
 * ENDAST FÖR LABB. En förutsägbar kod med obegränsad livslängd är precis det
 * som gör kortkoden osäker, och den står på listan över spärrar innan skarp
 * drift i docs/drift.md. I produktion skapas varje kod slumpad och kortlivad
 * via adminpanelen.
 */
const DEMO_PAIRING_CODE = "123456";
const DEMO_DEVICE_ID = "demo-kiosk-device";

async function main() {
  const demo = await prisma.company.upsert({
    where: { id: "demo-company" },
    update: {},
    create: {
      id: "demo-company",
      name: "Demo Mekaniska AB",
      subscriptionStatus: "ACTIVE",
      // 1,4 — samma påslag som pilotkunden räknar med i sitt kalkylark.
      markupPercent: 140,
      employees: {
        // Timkostnad per person i ören, som LÄGGS TILL momentets. En yrkesvan
        // svetsare kostar mer per timme än en lärling, och kalkylen ska visa
        // en skillnad som går att känna igen.
        //
        // David saknar sats med flit: kalkylen ska då räkna maskinen ensam och
        // inte tro att hans tid är gratis. Det läget finns hos varje kund som
        // inte hunnit fylla i alla.
        create: [
          { name: "Anna Andersson", costRateOre: 38000 },
          { name: "Björn Bergqvist", costRateOre: 42000 },
          { name: "Carina Cederlund", costRateOre: 35000 },
          { name: "David Dahl" },
        ],
      },
      workMoments: {
        // Timkostnader i ören. Maskintunga moment kostar mer per timme än
        // montering, så kalkylen visar något som går att känna igen.
        create: [
          { name: "Svetsning", costRateOre: 18000 },
          { name: "Fräsning", costRateOre: 24500 },
          { name: "Montering", costRateOre: 12000 },
          { name: "Lackering", costRateOre: 16500 },
          // Lämnad utan kostnad med flit: visar hur kalkylen flaggar tid som
          // saknar underlag i stället för att räkna den som noll.
          { name: "Kvalitetskontroll" },
        ],
      },
      // Improduktiv tid: eget register, ingen timkostnad, aldrig i ett
      // fakturaunderlag.
      indirectMoments: {
        create: [
          { name: "Städning" },
          { name: "Möte" },
          { name: "Underhåll" },
        ],
      },
    },
  });

  // Andra företaget finns för att kunna se isoleringen på riktigt.
  const other = await prisma.company.upsert({
    where: { id: "other-company" },
    update: {},
    create: {
      id: "other-company",
      name: "Grannens Verkstad AB",
      subscriptionStatus: "TRIALING",
      employees: {
        create: [
          { name: "Erik Ek", costRateOre: 36000 },
          { name: "Frida Falk", costRateOre: 36000 },
        ],
      },
      workMoments: {
        create: [
          { name: "Svarvning", costRateOre: 21000 },
          { name: "Slipning", costRateOre: 14000 },
        ],
      },
    },
  });

  // TILLVALEN SÄTTS EFTER FÖRETAGEN, av samma skäl som kunderna nedan: ett
  // nästlat create hade hoppats över på en databas som redan kört seed.
  //
  // Demoföretaget får BÅDA tillvalen, grannen får inget. Skillnaden är med
  // flit — då går det att se vad modulerna faktiskt döljer genom att logga in
  // på det ena företaget och sedan på det andra, i stället för att behöva slå
  // av och på dem i plattformspanelen.
  for (const module of ["PAYROLL", "PLANNING"]) {
    await prisma.companyModule.upsert({
      where: { companyId_module: { companyId: demo.id, module } },
      update: {},
      create: {
        companyId: demo.id,
        module,
        source: "MANUAL",
        enabledBy: "seed",
      },
    });
  }

  // STATIONERNA, som planeringstavlan har en rad var för.
  //
  // TVÅ FRÄSAR MED FLIT. En station kör ett arbetsmoment, men samma moment kan
  // ligga på flera stationer — och den regeln är lätt att missförstå tills man
  // ser den. Med två fräsar går det också att pröva att en ruta FLYTTAR mellan
  // dem, men vägras mot svetsen.
  //
  // Öppettiderna skiljer sig åt, likaså med flit: tidsaxeln på tavlan är den
  // vidaste av stationernas tider, och med identiska rader hade man aldrig
  // sett att den räknas fram.
  const STATIONER = [
    // namn, moment, öppnar, stänger, lunch
    ["Fräs 1", "Fräsning", 7 * 60, 16 * 60, [[12 * 60, 12 * 60 + 40]]],
    ["Fräs 2", "Fräsning", 6 * 60, 14 * 60 + 30, [[11 * 60, 11 * 60 + 30]]],
    ["Svetsbås", "Svetsning", 7 * 60, 16 * 60, [[12 * 60, 12 * 60 + 40]]],
    ["Monteringsbord", "Montering", 7 * 60, 16 * 60, [[12 * 60, 12 * 60 + 40]]],
    // Lackeringen går kvällsskift. Visar att en station kan ha helt andra
    // tider än resten, och att tavlans axel sträcker sig efter den.
    ["Lackbox", "Lackering", 14 * 60, 22 * 60, [[18 * 60, 18 * 60 + 30]]],
  ];

  const demoMoments = await prisma.workMoment.findMany({
    where: { companyId: demo.id },
    select: { id: true, name: true },
  });

  for (const [index, [name, moment, start, end, breaks]] of STATIONER.entries()) {
    const momentId = demoMoments.find((row) => row.name === moment)?.id;
    if (!momentId) continue;

    // Namnet är unikt per företag, så det går att slå upp på. Stationen
    // skapas bara en gång; körs seed igen lämnas den och sina dagar i fred.
    const existing = await prisma.station.findFirst({
      where: { companyId: demo.id, name },
      select: { id: true },
    });

    if (existing) continue;

    const station = await prisma.station.create({
      data: {
        companyId: demo.id,
        name,
        momentId,
        sortOrder: index,
      },
    });

    // Mån–fre. Helgen lämnas stängd, vilket är det normala — och tavlan döljer
    // då lördag och söndag helt, tills någon lägger en ruta där.
    for (let weekday = 1; weekday <= 5; weekday++) {
      await prisma.stationDay.create({
        data: {
          companyId: demo.id,
          stationId: station.id,
          weekday,
          startMinute: start,
          endMinute: end,
          breaks: {
            create: breaks.map(([from, to]) => ({
              companyId: demo.id,
              startMinute: from,
              endMinute: to,
            })),
          },
        },
      });
    }
  }

  // FRÅNVAROORSAKERNA ÄR KUNDENS EGNA RADER sedan 2026-10-01, inte en enum.
  // En arbetsyta som skapas via registreringen får dem automatiskt; seedens
  // företag skapas med upsert och behöver därför sina egna.
  //
  // Bara demoföretaget, som har löneunderlaget. Grannen ska se ut som en kund
  // utan modulen ser ut.
  const FRANVARO = [
    ["Sjuk", false],
    ["Vård av barn", false],
    ["Semester", false],
    ["Föräldraledig", false],
    ["Tjänstledig", false],
    ["Permission", false],
    ["Uttagen komp", true],
    ["Övrigt", false],
  ];

  for (const [index, [name, countsAsComp]] of FRANVARO.entries()) {
    await prisma.absenceReason.upsert({
      where: { companyId_name: { companyId: demo.id, name } },
      update: {},
      create: {
        companyId: demo.id,
        name,
        countsAsComp,
        sortOrder: index,
      },
    });
  }

  // KUNDERNA SKAPAS EFTER FÖRETAGEN och inte inuti deras create-block.
  //
  // Skälet är upserten ovan: `update: {}` betyder att ingenting händer när
  // företaget redan finns, och då hade ett nästlat `customers: { create }`
  // hoppats över tyst. Seed på en databas som redan kört seed hade sedan
  // kraschat på att kunden inte gick att slå upp.
  //
  // Tre kunder med olika prisläge, så att kalkylen har något att visa: en med
  // eget påslag, en med rabatt, en på företagets standard.
  const customer = async (companyId, name, data = {}) => {
    const existing = await prisma.customer.findFirst({
      where: { companyId, name },
      select: { id: true },
    });

    if (existing) return existing.id;

    return (
      await prisma.customer.create({ data: { companyId, name, ...data } })
    ).id;
  };

  await customer(demo.id, "Volvo Lastvagnar", {
    customerNumber: "1001",
    orgNumber: "556013-9700",
    contactName: "Anna Svensson",
    email: "anna.svensson@example.com",
    phone: "0520-123 45",
    addressLine: "Verkstadsgatan 4",
    postalCode: "462 35",
    city: "Vänersborg",
    // Lägre påslag än företagets 140 — en stor kund som förhandlat.
    markupPercent: 130,
  });
  await customer(demo.id, "Sandvik Coromant", {
    customerNumber: "1002",
    orgNumber: "556234-6362",
    contactName: "Björn Lind",
    email: "bjorn.lind@example.com",
    city: "Sandviken",
    // Stående rabatt, dras EFTER påslaget. Finns här för att visa att de två
    // rattarna räknas i rätt ordning.
    discountPercent: 10,
  });
  await customer(demo.id, "Atlas Copco", { customerNumber: "1003", city: "Nacka" });

  await customer(other.id, "Egen kund", { customerNumber: "1" });

  // ORDRARNA PEKAR PÅ KUNDERNA och skapas därför efter dem. Upsert på
  // (companyId, orderNumber) gör att en omkörning inte skapar dubbletter.
  const customerId = async (companyId, name) =>
    (
      await prisma.customer.findFirstOrThrow({
        where: { companyId, name },
        select: { id: true },
      })
    ).id;

  const order = async (companyId, orderNumber, customerName, extra = {}) => {
    const id = await customerId(companyId, customerName);

    await prisma.order.upsert({
      where: { companyId_orderNumber: { companyId, orderNumber } },
      update: {},
      create: { companyId, orderNumber, customerId: id, ...extra },
    });

    // FYLLER I KUNDEN NÄR DEN SAKNAS, men skriver aldrig över en som redan
    // står där. Demoordrarna fanns före kundregistret och fick customer_id =
    // NULL när fritextkolumnen försvann; utan den här raden hade de blivit
    // kundlösa för alltid. Samma regel som snabbjobb följer i quick-order.ts:
    // ny uppgift fylls i, en befintlig rörs inte.
    await prisma.order.updateMany({
      where: { companyId, orderNumber, customerId: null },
      data: { customerId: id },
    });
  };

  await order(demo.id, "2601", "Volvo Lastvagnar");
  // Fastprisorder, så kalkylen har något att räkna vinst på. 7 350 kr, samma
  // siffra som i kundens eget kalkylark.
  await order(demo.id, "2602", "Sandvik Coromant", { fixedPriceOre: 735000 });
  await order(demo.id, "2603", "Atlas Copco");

  // Samma ordernummer som demoföretaget — helt tillåtet, de ska inte krocka.
  await order(other.id, "2601", "Egen kund");

  // BERÄKNAD TID PER ARBETSMOMENT, I DEN ORDNING DE SKA GÖRAS.
  //
  // Utan den här biten står Oplacerat tomt på planeringstavlan, och modulen
  // går inte att pröva utan att först fylla i tre ordrar för hand. Ordningen
  // är den som ritas som pilar: svetsning före fräsning före montering.
  //
  // 2602 delar två moment med 2601 med flit. Då går det att se att pilarna
  // hör till VARJE ORDER för sig och inte till momenten i allmänhet.
  const BERAKNINGAR = [
    ["2601", [["Svetsning", 240], ["Fräsning", 360], ["Montering", 120]]],
    ["2602", [["Fräsning", 180], ["Lackering", 240]]],
    ["2603", [["Montering", 300], ["Kvalitetskontroll", 60]]],
  ];

  for (const [orderNumber, rader] of BERAKNINGAR) {
    const found = await prisma.order.findFirst({
      where: { companyId: demo.id, orderNumber },
      select: { id: true },
    });

    if (!found) continue;

    // Körs seed igen lämnas en befintlig beräkning i fred. Den kan ha ändrats
    // på skärmen, och seed ska inte skriva tillbaka sina egna siffror över
    // något någon arbetat med.
    const already = await prisma.orderBudget.count({
      where: { orderId: found.id },
    });

    if (already > 0) continue;

    for (const [index, [momentName, minutes]] of rader.entries()) {
      const moment = demoMoments.find((row) => row.name === momentName);
      if (!moment) continue;

      await prisma.orderBudget.create({
        data: {
          companyId: demo.id,
          orderId: found.id,
          momentId: moment.id,
          minutes,
          sortOrder: index,
        },
      });
    }
  }

  // Testskärm för demoföretaget, i väntande läge med en fast kod. Koden
  // sparas som fingeravtryck, precis som en riktig — bara att den här är
  // förutsägbar så att du kan koppla om testskärmen hur många gånger som helst.
  const codeHash = createHash("sha256").update(DEMO_PAIRING_CODE).digest("hex");
  const farFuture = new Date("2126-01-01T00:00:00Z");

  // Fast id i stället för upslag på kodens fingeravtryck. Koden förbrukas när
  // skärmen kopplas, och en upsert på fingeravtrycket hade då skapat en ny
  // skärm vid varje omkörning tills licenserna tog slut.
  await prisma.kioskDevice.upsert({
    where: { id: DEMO_DEVICE_ID },
    update: {
      companyId: demo.id,
      tokenHash: null,
      pairingCodeHash: codeHash,
      pairingExpiresAt: farFuture,
    },
    create: {
      id: DEMO_DEVICE_ID,
      companyId: demo.id,
      name: "Verkstaden (testskärm)",
      pairingCodeHash: codeHash,
      pairingExpiresAt: farFuture,
    },
  });

  // Adminkonto för labbet. Byt lösenord innan systemet används på riktigt —
  // det står i klartext här och repot är läsbart.
  const adminEmail = "admin@demo.se";
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      companyId: demo.id,
      email: adminEmail,
      passwordHash: await bcrypt.hash("tikkr123", 12),
      role: "OWNER",
    },
  });

  // Räknar bara demoföretagens rader. En global räkning hade tagit med allt
  // annat som råkat hamna i databasen och gett en missvisande siffra.
  const ids = [demo.id, other.id];
  const counts = {
    anstallda: await prisma.employee.count({ where: { companyId: { in: ids } } }),
    kunder: await prisma.customer.count({ where: { companyId: { in: ids } } }),
    ordrar: await prisma.order.count({ where: { companyId: { in: ids } } }),
    moment: await prisma.workMoment.count({ where: { companyId: { in: ids } } }),
    stationer: await prisma.station.count({ where: { companyId: { in: ids } } }),
  };

  console.log("Seed klar:");
  console.log(`  ${demo.name} (id: ${demo.id})`);
  console.log(`  ${other.name} (id: ${other.id})`);
  console.log(
    `  Totalt: ${counts.anstallda} anställda, ${counts.kunder} kunder, ` +
      `${counts.ordrar} ordrar, ${counts.moment} moment, ` +
      `${counts.stationer} stationer`
  );
  console.log("");
  console.log("Koppla testskärmen: öppna /kiosk och knappa in koden");
  console.log(`  ${DEMO_PAIRING_CODE}`);
  console.log("");
  console.log("Logga in i adminpanelen på /admin/login:");
  console.log(`  ${adminEmail} / tikkr123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
