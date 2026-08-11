/**
 * SPÄRR MOT ATT KÖRA TESTER MOT SKARP DATABAS.
 *
 * Testerna skapar och raderar företag. Kör de mot appens databas försvinner
 * riktig data, och det märks inte förrän någon letar efter den.
 *
 * Att peka om databasen i scripts/test.sh räcker inte: kör någon testerna på
 * något annat sätt — direkt med vitest, från en editor, i ett framtida
 * bygg-jobb — är det skyddet borta. Därför vägrar testerna själva att starta
 * mot en databas som inte uttryckligen är en testdatabas.
 *
 * Regeln är enkel med flit: databasens namn måste sluta på "_test". Ett namn
 * går att kontrollera med blotta ögat, och en databas som heter så innehåller
 * inget värt att gråta över.
 */

const url = process.env.DATABASE_URL ?? "";

if (!url) {
  throw new Error(
    "DATABASE_URL saknas. Kör testerna med ./scripts/test.sh, som pekar dem " +
      "mot en egen testdatabas."
  );
}

const databaseName = url.split("/").pop()?.split("?")[0] ?? "";

if (!databaseName.endsWith("_test")) {
  throw new Error(
    [
      "",
      "STOPP: testerna vägrar köra mot databasen " + `"${databaseName}".`,
      "",
      "Testerna skapar och raderar företag. Mot en skarp databas betyder det",
      "att riktig kunddata försvinner.",
      "",
      'Databasens namn måste sluta på "_test". Kör:',
      "",
      "  ./scripts/test.sh",
      "",
    ].join("\n")
  );
}
