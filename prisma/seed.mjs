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
      // Kundregistret. Ordrarna kopplas till det nedan, efter att företaget
      // skapats — kundernas id behövs först.
      //
      // Tre kunder med olika prisläge, så att kalkylen har något att visa:
      // en med eget påslag, en med rabatt, en på företagets standard.
      customers: {
        create: [
          {
            name: "Volvo Lastvagnar",
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
          },
          {
            name: "Sandvik Coromant",
            customerNumber: "1002",
            orgNumber: "556234-6362",
            contactName: "Björn Lind",
            email: "bjorn.lind@example.com",
            city: "Sandviken",
            // Stående rabatt, dras EFTER påslaget. Finns här för att visa att
            // de två rattarna räknas i rätt ordning.
            discountPercent: 10,
          },
          {
            name: "Atlas Copco",
            customerNumber: "1003",
            city: "Nacka",
          },
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
      customers: { create: [{ name: "Egen kund", customerNumber: "1" }] },
    },
  });

  // ORDRARNA SKAPAS EFTER FÖRETAGEN, eftersom de pekar på kunder som inte har
  // något id förrän de finns. Upsert på (companyId, orderNumber) gör att en
  // omkörning inte skapar dubbletter.
  const customerId = async (companyId, name) =>
    (
      await prisma.customer.findFirstOrThrow({
        where: { companyId, name },
        select: { id: true },
      })
    ).id;

  const order = async (companyId, orderNumber, customerName, extra = {}) =>
    prisma.order.upsert({
      where: { companyId_orderNumber: { companyId, orderNumber } },
      update: {},
      create: {
        companyId,
        orderNumber,
        customerId: await customerId(companyId, customerName),
        ...extra,
      },
    });

  await order(demo.id, "2601", "Volvo Lastvagnar");
  // Fastprisorder, så kalkylen har något att räkna vinst på. 7 350 kr, samma
  // siffra som i kundens eget kalkylark.
  await order(demo.id, "2602", "Sandvik Coromant", { fixedPriceOre: 735000 });
  await order(demo.id, "2603", "Atlas Copco");

  // Samma ordernummer som demoföretaget — helt tillåtet, de ska inte krocka.
  await order(other.id, "2601", "Egen kund");

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
  };

  console.log("Seed klar:");
  console.log(`  ${demo.name} (id: ${demo.id})`);
  console.log(`  ${other.name} (id: ${other.id})`);
  console.log(
    `  Totalt: ${counts.anstallda} anställda, ${counts.kunder} kunder, ` +
      `${counts.ordrar} ordrar, ${counts.moment} moment`
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
