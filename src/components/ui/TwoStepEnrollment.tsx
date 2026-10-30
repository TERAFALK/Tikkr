/**
 * UPPSÄTTNINGEN AV AUTENTISERINGSAPPEN: stegen, QR-koden och nyckeln.
 *
 * Bröts ut ur `TwoStepForm` 2026-10-11, när uppsättningen fick en andra plats.
 * Den sker numera på två ställen:
 *
 *   inloggningen    för den som tvingas, alltså från andra inloggningen
 *   Ditt konto      för den som nyss registrerat och vill göra det direkt
 *
 * Instruktionen är det som gör uppsättningen möjlig för någon som aldrig
 * gjort den förut, och den fick inte bli två texter som glider isär. Är den
 * fel kommer personen inte in alls.
 *
 * Komponenten är avsiktligt ren: den tar enrollment och ritar den, och vet
 * ingenting om vad som händer med koden efteråt. Kodfältet ligger kvar hos
 * den som äger formuläret, eftersom de två ställena skickar den vidare till
 * olika åtgärder.
 *
 * QR-koden kommer som färdig SVG från servern (two-step.ts) och skrivs in som
 * den är. Innehållet är vår egen länk, inget en användare skrivit.
 */
export interface Enrollment {
  key: string;
  uri: string;
  qrSvg: string;
}

export default function TwoStepEnrollment({
  enrollment,
}: {
  enrollment: Enrollment;
}) {
  return (
    <div className="space-y-3">
      {/* STEG FÖR STEG, och inte en mening.

          Stod "Skanna koden med en autentiseringsapp, till exempel
          Microsoft Authenticator eller Google Authenticator". Det säger
          VAD som ska hända men inte var man trycker, och den som aldrig
          satt upp en sådan app hittar inte skannern: den ligger bakom
          Lägg till konto, under ett val som heter något annat än
          "autentiseringsapp" i varje app.

          Det här är ett av de få ställen där en längre förklaring hör
          hemma, se CLAUDE.md § 7.1 sista stycket. Går uppsättningen
          fel kommer man inte in alls. */}
      <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-neutral-600 marker:text-neutral-400">
        <li>
          Installera Microsoft Authenticator eller Google Authenticator på
          telefonen.
        </li>
        <li>Välj Lägg till konto, och sedan Annat konto.</li>
        <li>Skanna koden nedan.</li>
        <li>Skriv in de sex siffrorna appen visar.</li>
      </ol>

      <div
        className="mx-auto w-48 rounded-md bg-white p-2 ring-1 ring-neutral-200"
        dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }}
      />

      <p className="text-center">
        <a
          href={enrollment.uri}
          className="text-[13px] font-medium text-link hover:underline"
        >
          Öppna i appen på den här telefonen
        </a>
      </p>

      {/* NYCKELN LIGGER DOLD. Den behövs bara av den som inte kan
          skanna, och i klartext bredvid QR-koden gjorde den rutan rörig
          för alla andra.

          <details> och inte en knapp med eget tillstånd: webbläsaren
          sköter öppning, tangentbord och uppläsning, och rutan behöver
          ingen extra rad kod. */}
      <details className="text-center">
        <summary className="cursor-pointer text-[13px] font-medium text-neutral-500 hover:text-neutral-900">
          Kan inte skanna?
        </summary>
        <p className="mt-2 text-[13px] text-neutral-600">
          Välj Ange nyckel manuellt i appen och skriv in:
          <span className="mt-1 block font-mono text-sm tracking-wider break-all text-neutral-900">
            {enrollment.key}
          </span>
        </p>
      </details>
    </div>
  );
}
