#!/usr/bin/env node
// Hämtar driftkitet på en bestämd version till appen.
//
//   node ops/sync.mjs v1.3.0
//
// Körs på laptopen, på en vanlig gren. Resultatet är en PR som alla andra, och
// appens tagg beskriver därmed allt som körs på servern. Servern behöver ingen
// åtkomst till tf-framework.
//
// ops/app.conf och ops/hooks/ är appens egna och rörs inte.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checksums, APP_OWNED } from "./verify.mjs";

const tag = process.argv[2];

if (!tag || !/^v\d+\.\d+\.\d+/.test(tag)) {
  console.error("Användning: node ops/sync.mjs v1.3.0");
  process.exit(1);
}

const opsDir = path.dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(path.join(tmpdir(), "tf-framework-"));

try {
  const clone = spawnSync(
    "git",
    ["clone", "--quiet", "--depth", "1", "--branch", tag,
      "https://github.com/TERAFALK/tf-framework.git", tmp],
    { stdio: "inherit" }
  );

  if (clone.status !== 0) {
    console.error(`Kunde inte hämta ${tag}.`);
    process.exit(1);
  }

  const source = path.join(tmp, "ops");

  for (const name of readdirSync(source)) {
    if (APP_OWNED.includes(name)) continue;
    cpSync(path.join(source, name), path.join(opsDir, name), { recursive: true });
  }

  if (!existsSync(path.join(opsDir, "app.conf"))) {
    console.log("ops/app.conf saknas. Kopiera ops/app.conf.example och fyll i den.");
  }

  writeFileSync(path.join(opsDir, "VERSION"), `${tag}\n`);
  writeFileSync(path.join(opsDir, "CHECKSUMS"), checksums(opsDir));

  console.log(`Driftkitet är nu ${tag}. Läs ändringarna och öppna en PR.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
