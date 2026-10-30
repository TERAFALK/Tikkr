import { describe, it, expect } from "vitest";
import {
  fullName,
  nameProblem,
  storedName,
  MIN_NAME_LENGTH,
} from "@/lib/person-name";

/**
 * FÖRNAMN OCH EFTERNAMN (issue #16).
 *
 * Visningsnamnet lagras inte, det räknas fram, och det är den räkningen som
 * står här. Går den fel syns det som ett namn som inte stämmer med fälten man
 * just sparat, vilket är precis den sortens fel ingen rapporterar och alla
 * noterar.
 *
 * Behöver ingen databas och går därför att köra på laptopen, se CLAUDE.md § 9.
 */

describe("visningsnamnet", () => {
  it("slås ihop av de två fälten", () => {
    expect(fullName({ firstName: "Agneta", lastName: "Ägare" })).toBe(
      "Agneta Ägare"
    );
  });

  it("trimmar och lämnar aldrig dubbla mellanslag", () => {
    expect(fullName({ firstName: "  Agneta  ", lastName: "  Ägare " })).toBe(
      "Agneta Ägare"
    );
  });

  /**
   * ETT HALVT NAMN ÄR ETT NAMN.
   *
   * Den som bjudits in får lämna fälten tomma, och migrationen gav den som
   * bara skrivit sitt förnamn ett förnamn utan efternamn. Båda fallen ska visa
   * det som finns, inte "Agneta undefined".
   */
  it("klarar att bara ett av fälten är ifyllt", () => {
    expect(fullName({ firstName: "Agneta" })).toBe("Agneta");
    expect(fullName({ lastName: "Ägare" })).toBe("Ägare");
    expect(fullName({ firstName: "Agneta", lastName: "   " })).toBe("Agneta");
  });

  /**
   * TOMT BLIR NULL OCH INTE TOM STRÄNG.
   *
   * Varje ställe som visar ett namn har ett svar på vad som står i stället,
   * nämligen e-postadressen. En tom sträng hade smugit igenom som ett namn och
   * lämnat ett hål i en lista.
   */
  it("svarar null när ingenting är ifyllt", () => {
    expect(fullName({})).toBeNull();
    expect(fullName({ firstName: null, lastName: null })).toBeNull();
    expect(fullName({ firstName: " ", lastName: "" })).toBeNull();
  });
});

describe("kontrollen av ett namn som krävs", () => {
  it("pekar ut ett led i taget", () => {
    expect(nameProblem({ firstName: "", lastName: "" })).toBe(
      "Ange ditt förnamn."
    );

    expect(nameProblem({ firstName: "Agneta", lastName: " " })).toBe(
      "Ange ditt efternamn."
    );
  });

  it("godkänner ett helt namn", () => {
    expect(nameProblem({ firstName: "Agneta", lastName: "Ägare" })).toBeNull();
  });

  it("ett enda tecken räcker inte i något av fälten", () => {
    expect(MIN_NAME_LENGTH).toBe(2);
    expect(nameProblem({ firstName: "A", lastName: "Ägare" })).toBeTruthy();
    expect(nameProblem({ firstName: "Bo", lastName: "Ek" })).toBeNull();
  });
});

describe("värdet som lagras", () => {
  it("trimmas, och tomt blir null", () => {
    expect(storedName({ firstName: " Agneta ", lastName: " Ägare " })).toEqual({
      firstName: "Agneta",
      lastName: "Ägare",
    });

    expect(storedName({ firstName: "Agneta", lastName: "  " })).toEqual({
      firstName: "Agneta",
      lastName: null,
    });

    expect(storedName({})).toEqual({ firstName: null, lastName: null });
  });
});
