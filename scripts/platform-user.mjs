// Skapar eller uppdaterar ett plattformskonto.
//
// Körs av scripts/platform-user.sh. Lösenordet läses från standard input och
// aldrig från ett argument eller en miljövariabel — argument syns i
// processlistan och miljövariabler i "docker inspect".
//
//   node scripts/platform-user.mjs <e-postadress> [--ta-bort]

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const email = (process.argv[2] ?? "").trim().toLowerCase();
const remove = process.argv.includes("--ta-bort");

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Ange en giltig e-postadress.");
  process.exit(1);
}

async function readPassword() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString().replace(/\r?\n$/, "");
}

async function main() {
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
