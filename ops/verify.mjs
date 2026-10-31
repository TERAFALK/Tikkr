#!/usr/bin/env node
// Kontrollerar att driftkitet i appen är orört.
//
//   node ops/verify.mjs
//
// En ändring i en kopia försvinner vid nästa uppdatering utan att någon märker
// det. Det som ska skilja sig mellan appar hör hemma i ops/app.conf och i
// ops/hooks/. Körs av app-ci.yml.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Appens egna filer. Allt annat i ops/ är en kopia ur tf-framework. */
export const APP_OWNED = ["app.conf", "hooks", "VERSION", "CHECKSUMS"];

/** En rad per fil: kontrollsumma och namn, i bokstavsordning. */
export function checksums(dir) {
  const lines = [];

  for (const name of readdirSync(dir).sort()) {
    if (APP_OWNED.includes(name)) continue;
    const file = path.join(dir, name);
    if (!statSync(file).isFile()) continue;

    // Radslut normaliseras, eftersom kit:et checkas ut på både Windows och Linux.
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const sum = createHash("sha256").update(text).digest("hex");
    lines.push(`${sum}  ${name}`);
  }

  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const recorded = path.join(dir, "CHECKSUMS");

  if (!existsSync(recorded)) {
    console.error("ops/CHECKSUMS saknas. Hämta kitet med: node ops/sync.mjs <version>");
    process.exit(1);
  }

  const expected = readFileSync(recorded, "utf8").replace(/\r\n/g, "\n");

  if (expected !== checksums(dir)) {
    console.error(
      "Filer i ops/ är ändrade. Lägg ändringen i ops/app.conf eller ops/hooks/, " +
        "eller i tf-framework."
    );
    process.exit(1);
  }

  console.log("Driftkitet är orört.");
}
