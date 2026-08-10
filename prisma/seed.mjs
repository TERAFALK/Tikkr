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

const prisma = new PrismaClient();

/**
 * Fast token för testskärmen, så att kopplingslänken är densamma varje gång
 * du kör seed. ENDAST FÖR LABB — i skarp drift skapas varje skärm med en
 * slumpad token via adminpanelen (Fas 2).
 */
const DEMO_KIOSK_TOKEN = "demo-labb-token-anvand-aldrig-i-skarp-drift";

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

  // Testskärm för demoföretaget. Token sparas som fingeravtryck, precis som
  // en riktig skärm — bara att den här är förutsägbar så du kan testa.
  await prisma.kioskDevice.upsert({
    where: { tokenHash: createHash("sha256").update(DEMO_KIOSK_TOKEN).digest("hex") },
    update: { active: true },
    create: {
      companyId: demo.id,
      name: "Verkstaden (testskärm)",
      tokenHash: createHash("sha256").update(DEMO_KIOSK_TOKEN).digest("hex"),
    },
  });

  const counts = {
    anstallda: await prisma.employee.count(),
    ordrar: await prisma.order.count(),
    moment: await prisma.workMoment.count(),
  };

  console.log("Seed klar:");
  console.log(`  ${demo.name} (id: ${demo.id})`);
  console.log(`  ${other.name} (id: ${other.id})`);
  console.log(
    `  Totalt: ${counts.anstallda} anställda, ${counts.ordrar} ordrar, ${counts.moment} moment`
  );
  console.log("");
  console.log("Koppla testskärmen genom att öppna denna adress EN gång:");
  console.log(`  /kiosk/koppla/${DEMO_KIOSK_TOKEN}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
