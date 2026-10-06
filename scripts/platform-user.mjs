// Skapar eller uppdaterar ett plattformskonto.
//
// Körs av scripts/platform-user.sh. Lösenordet läses från standard input och
// aldrig från ett argument eller en miljövariabel — argument syns i
// processlistan och miljövariabler i "docker inspect".
//
//   node scripts/platform-user.mjs <e-postadress> [--ta-bort | --kod]

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { base32Encode, sealSecret } from "../src/lib/totp-box.mjs";

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
 * Sätter upp tvåstegsinloggningen: en ny nyckel till autentiseringsappen.
 *
 * Varje körning ger en NY nyckel och gör den gamla ogiltig. Det är så en
 * borttappad telefon stängs ute: kör kommandot igen och lägg in den nya
 * nyckeln i den nya telefonen.
 *
 * Nyckeln visas en gång, här i terminalen, och lagras bara krypterad.
 */
async function setUpTotp() {
  const account = await prisma.platformUser.findUnique({ where: { email } });
  if (!account) {
    console.error(`Hittade inget konto för ${email}. Sätt ett lösenord först.`);
    process.exit(1);
  }

  const authSecret = process.env.AUTH_SECRET ?? "";
  if (!authSecret) {
    console.error("AUTH_SECRET saknas. Kör kommandot via scripts/platform-user.sh.");
    process.exit(1);
  }

  // 20 byte är vad RFC 6238 rekommenderar för SHA-1, och vad apparna väntar sig.
  const secret = randomBytes(20);
  const key = base32Encode(secret);

  await prisma.platformUser.update({
    where: { email },
    data: { totpSecret: sealSecret(secret, authSecret), totpLastStep: null },
  });

  await prisma.platformAuditLog.create({
    data: {
      actorEmail: email,
      action: "Tvåstegsinloggning uppsatt från servern",
    },
  });

  const grouped = key.match(/.{1,4}/g).join(" ");
  const uri =
    `otpauth://totp/Tikkr:${encodeURIComponent(email)}` +
    `?secret=${key}&issuer=Tikkr&algorithm=SHA1&digits=6&period=30`;

  console.log("");
  console.log("Lägg in nyckeln i autentiseringsappen (Microsoft Authenticator,");
  console.log("Google Authenticator eller liknande): välj att lägga till ett");
  console.log("konto, sedan \"Ange nyckel manuellt\" och tidsbaserad.");
  console.log("");
  console.log(`  Konto:   Tikkr ${email}`);
  console.log(`  Nyckel:  ${grouped}`);
  console.log("");
  console.log("Eller som länk, för appar som tar emot en sådan:");
  console.log(`  ${uri}`);
  console.log("");
  console.log("Nyckeln visas bara den här gången. En tidigare nyckel gäller inte längre.");
  console.log("Logga sedan in med lösenordet och koden appen visar.");
}

async function main() {
  if (totp) {
    await setUpTotp();
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

  if (!existed?.totpSecret) {
    console.log("");
    console.log("Sätt upp tvåstegsinloggningen innan första inloggningen:");
    console.log(`  ./scripts/platform-user.sh ${email} --kod`);
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
