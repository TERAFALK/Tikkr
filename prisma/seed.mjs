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
      employees: {
        create: [
          { name: "Anna Andersson" },
          { name: "Björn Bergqvist" },
          { name: "Carina Cederlund" },
          { name: "David Dahl" },
        ],
      },
      workMoments: {
        create: [
          { name: "Svetsning" },
          { name: "Fräsning" },
          { name: "Montering" },
          { name: "Lackering" },
          { name: "Kvalitetskontroll" },
        ],
      },
      orders: {
        create: [
          { orderNumber: "2601", customerName: "Volvo Lastvagnar" },
          { orderNumber: "2602", customerName: "Sandvik Coromant" },
          { orderNumber: "2603", customerName: "Atlas Copco" },
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
      employees: { create: [{ name: "Erik Ek" }, { name: "Frida Falk" }] },
      workMoments: { create: [{ name: "Svarvning" }, { name: "Slipning" }] },
      // Samma ordernummer som demoföretaget — helt tillåtet, de ska inte krocka.
      orders: { create: [{ orderNumber: "2601", customerName: "Egen kund" }] },
    },
  });

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
    ordrar: await prisma.order.count({ where: { companyId: { in: ids } } }),
    moment: await prisma.workMoment.count({ where: { companyId: { in: ids } } }),
  };

  console.log("Seed klar:");
  console.log(`  ${demo.name} (id: ${demo.id})`);
  console.log(`  ${other.name} (id: ${other.id})`);
  console.log(
    `  Totalt: ${counts.anstallda} anställda, ${counts.ordrar} ordrar, ${counts.moment} moment`
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
