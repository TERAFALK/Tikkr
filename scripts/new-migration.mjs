#!/usr/bin/env node
// Skapar en migration av ändringarna i prisma/schema.prisma.
//
// Körs på LAPTOPEN, i samma gren som schemaändringen och före commit:
//
//   node scripts/new-migration.mjs lagg-till-foto-pa-anstalld
//
// Ingen databas behövs. Skriptet jämför schemat som det såg ut vid senaste
// commit med schemat som det ser ut nu, och skriver skillnaden som SQL i
// prisma/migrations/<tid>_<namn>/migration.sql. Är schemaändringen redan
// committad, jämför mot main i stället:
//
//   node scripts/new-migration.mjs lagg-till-foto-pa-anstalld --fran origin/main
//
// Varför inte "prisma migrate dev": den kräver en databas att prova mot, och
// laptopen har ingen. Servern skulle kunna, men den skriver aldrig till
// GitHub (CLAUDE.md § 9). CI kontrollerar efteråt att migrationerna och
// schemat stämmer, så en migration som blivit fel fälls där och inte i
// produktionen.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--fran");
const fromRef = fromIndex >= 0 ? args[fromIndex + 1] : "HEAD";
const name =
  fromIndex >= 0
    ? args.filter((_, i) => i !== fromIndex && i !== fromIndex + 1)[0]
    : args[0];

// "Anteckning på skärm" → "anteckning_pa_skarm". Mappnamnet ska gå att skriva
// i alla skal.
const slug = (name ?? "")
  .toLowerCase()
  .replace(/[åä]/g, "a")
  .replace(/ö/g, "o")
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_|_$/g, "");

if (!slug || !fromRef) {
  console.error("Användning: node scripts/new-migration.mjs <namn> [--fran <ref>]");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = path.join(root, "prisma", "schema.prisma");

function run(cmd, cmdArgs) {
  // npx är ett skript på Windows och kräver ett skal där. Med skal skickas
  // kommandot som en enda rad; sökvägarna är redan citerade.
  const result =
    process.platform === "win32"
      ? spawnSync([cmd, ...cmdArgs].join(" "), { cwd: root, encoding: "utf8", shell: true })
      : spawnSync(cmd, cmdArgs.map((a) => a.replace(/^"|"$/g, "")), { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

// Schemat som det var vid jämförelsepunkten.
const before = run("git", ["show", `${fromRef}:prisma/schema.prisma`]);
const tmp = mkdtempSync(path.join(tmpdir(), "tikkr-migration-"));
const beforeFile = path.join(tmp, "schema.prisma");
writeFileSync(beforeFile, before);

let sql;
try {
  sql = run("npx", [
    "prisma", "migrate", "diff",
    "--from-schema-datamodel", `"${beforeFile}"`,
    "--to-schema-datamodel", `"${schema}"`,
    "--script",
  ]);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (!sql.trim() || /This is an empty migration/.test(sql)) {
  console.log(`Ingen skillnad mot ${fromRef}. Ingen migration skapad.`);
  process.exit(0);
}

// Prismas eget format för namnet: tidpunkt i UTC, sedan namnet.
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const dir = path.join(root, "prisma", "migrations", `${stamp}_${slug}`);

if (existsSync(dir)) {
  console.error(`${dir} finns redan.`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "migration.sql"), sql);

console.log(`Skapad: prisma/migrations/${stamp}_${slug}/migration.sql`);

// Regeln i CLAUDE.md § 0: en migration ska fungera med FÖREGÅENDE version av
// appen. Det här är de satser som bryter mot den, eller som rör befintliga
// rader, och som därför ska stå i PR-beskrivningen.
const risky = sql
  .split("\n")
  .filter((line) =>
    /\b(DROP|RENAME)\b|ALTER COLUMN .* (TYPE|SET NOT NULL)|^\s*(UPDATE|DELETE)\b/i.test(line)
  );

if (risky.length) {
  console.log("");
  console.log("OBS — satser som tar bort, döper om eller skärper något:");
  for (const line of risky) console.log("  " + line.trim());
  console.log("");
  console.log("Fungerar den förra versionen av appen fortfarande efter det här?");
  console.log("Om inte: dela upp ändringen på två releaser, och skriv det i PR:en.");
}
