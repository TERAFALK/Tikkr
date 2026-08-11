// Stoppar "npm test".
//
// Det kommandot kör vitest med den DATABASE_URL som råkar vara satt — vilket i
// den här appens containrar är den SKARPA databasen. Testerna skapar och
// raderar företag, så det skulle radera riktig kunddata.
//
// Testerna körs med ./scripts/test.sh, som pekar dem mot en egen databas.
//
// Det finns redan en spärr i tests/setup.ts som vägrar en databas vars namn
// inte slutar på "_test". Den här finns ändå, av två skäl: den stoppar innan
// något ens ansluter, och den fångar fallet där någon kör en gammal image där
// setup-filen saknas.

console.error(
  [
    "",
    'STOPP: kör inte testerna med "npm test".',
    "",
    "Kommandot skulle köra dem mot appens skarpa databas, och testerna",
    "raderar företag. Använd istället:",
    "",
    "  ./scripts/test.sh",
    "",
    "Det skriptet skapar och använder en separat testdatabas.",
    "",
  ].join("\n")
);

process.exit(1);
