import { describe, it, expect } from "vitest";
import { filterUnplaced, unplacedMoments } from "@/lib/plan-filter";

const rows = [
  { orderNumber: "2601", customerName: "Volvo Lastvagnar", momentId: "s", momentName: "Svetsning" },
  { orderNumber: "2601", customerName: "Volvo Lastvagnar", momentId: "f", momentName: "Fräsning" },
  { orderNumber: "2702", customerName: "Atlas Copco", momentId: "f", momentName: "Fräsning" },
  { orderNumber: "2703", customerName: null, momentId: "m", momentName: "Montering" },
];

const numbers = (result: typeof rows) =>
  result.map((row) => `${row.orderNumber}:${row.momentId}`);

describe("sökningen i Oplacerat", () => {
  it("visar allt utan sökord", () => {
    expect(filterUnplaced(rows, "  ", "")).toHaveLength(4);
  });

  it("söker på ordernummer", () => {
    expect(numbers(filterUnplaced(rows, "2702", ""))).toEqual(["2702:f"]);
  });

  it("söker på kund, oavsett skiftläge", () => {
    expect(numbers(filterUnplaced(rows, "ATLAS", ""))).toEqual(["2702:f"]);
  });

  it("söker på arbetsmoment", () => {
    expect(filterUnplaced(rows, "fräs", "")).toHaveLength(2);
  });

  it("alla ord ska träffa", () => {
    expect(numbers(filterUnplaced(rows, "volvo svets", ""))).toEqual(["2601:s"]);
  });

  it("filtrerar på arbetsmoment", () => {
    expect(filterUnplaced(rows, "", "f")).toHaveLength(2);
  });

  it("en rad utan kund faller inte bort", () => {
    expect(numbers(filterUnplaced(rows, "2703", ""))).toEqual(["2703:m"]);
  });
});

describe("arbetsmomenten i listan", () => {
  it("står en gång var, i svensk ordning", () => {
    expect(unplacedMoments(rows).map((moment) => moment.name)).toEqual([
      "Fräsning",
      "Montering",
      "Svetsning",
    ]);
  });
});
