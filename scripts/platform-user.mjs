// Skapar eller uppdaterar ett plattformskonto.
//
// Körs av scripts/platform-user.sh. Lösenordet läses från standard input och
// aldrig från ett argument eller en miljövariabel — argument syns i
// processlistan och miljövariabler i "docker inspect".
//
//   node scripts/platform-user.mjs <e-postadress> [--ta-bort | --kod]

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const email = (process.argv[2] ?? "").trim().toLowerCase();
const remove = process.argv.includes("--ta-bort");
const totp = process.argv.includes("--kod");

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Ange en giltig e-postadress.");
  process.exit(1);
}

async function readPassword() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString().replace(/\r?\n$/, "");
}

/**
 * Nollställer tvåstegsinloggningen.
 *
 * För den som tappat bort sin telefon eller bytt till en ny. Nyckeln raderas,
 * och nästa inloggning i plattformspanelen visar en ny QR-kod efter
 * lösenordet. Uppsättningen sker alltså i webben, med samma flöde som
 * kundernas (beslutat 2026-10-06), och bara den som kan köra det här
 * kommandot kan börja om.
 */
async function resetTotp() {
  const account = await prisma.platformUser.findUnique({ where: { email } });
  if (!account) {
    console.error(`Hittade inget konto för ${email}. Sätt ett lösenord först.`);
    process.exit(1);
  }

  await prisma.platformUser.update({
    where: { email },
    data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
  });

  await prisma.platformAuditLog.create({
    data: {
      actorEmail: email,
      action: "Tvåstegsinloggning nollställd från servern",
    },
  });

  console.log(`Tvåstegsinloggningen för ${email} är nollställd.`);
  console.log("Nästa inloggning i plattformspanelen visar en ny QR-kod.");
}

async function main() {
  if (totp) {
    await resetTotp();
    return;
  }

  if (remove) {
    const gone = await prisma.platformUser.deleteMany({ where: { email } });
    console.log(
      gone.count > 0
        ? `Kontot ${email} är borttaget.`
        : `Hittade inget konto för ${email}.`
    );
    console.log(
      "Kom ihåg att också ta bort adressen ur PLATFORM_ADMIN_EMAILS i .env."
    );
    return;
  }

  const password = await readPassword();

  if (password.length < 12) {
    console.error(
      "Lösenordet måste vara minst 12 tecken. Det här kontot ser alla kunders\n" +
        "driftdata — det ska vara längre än ett vanligt kundlösenord."
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existed = await prisma.platformUser.findUnique({ where: { email } });

  await prisma.platformUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });

  await prisma.platformAuditLog.create({
    data: {
      actorEmail: email,
      action: existed
        ? "Lösenord ändrat från servern"
        : "Plattformskonto skapat från servern",
    },
  });

  console.log(existed ? `Nytt lösenord satt för ${email}.` : `Kontot ${email} är skapat.`);

  if (!existed?.totpEnabledAt) {
    console.log("");
    console.log("Första inloggningen i plattformspanelen visar en QR-kod att");
    console.log("skanna med en autentiseringsapp.");
  }

  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(email)) {
    console.log("");
    console.log("OBS: adressen står inte i PLATFORM_ADMIN_EMAILS.");
    console.log("Kontot kan inte logga in förrän den gör det:");
    console.log("");
    console.log(`  PLATFORM_ADMIN_EMAILS=${[...allowed, email].join(",")}`);
    console.log("");
    console.log("Lägg in raden i .env och kör: docker compose up -d");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
