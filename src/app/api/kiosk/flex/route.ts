import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { getKioskSession } from "@/lib/kiosk-auth";
import { hasModule } from "@/lib/company-modules";
import { forCompany } from "@/lib/tenant";
import { companyTimeZone } from "@/lib/company";
import { currentFlexMinutes } from "@/lib/payroll";
import {
  clearFailedLogins,
  isLockedOut,
  noteFailedLogin,
} from "@/lib/login-throttle";

/**
 * SITT EGET FLEXSALDO PÅ STÄMPLINGSSKÄRMEN.
 *
 * Den anställde trycker på sitt namn, anger sin personliga kod och ser sitt
 * saldo. Koden sätts av administratören under Anställda.
 *
 * VARFÖR EN KOD HÄR MEN INTE VID STÄMPLING. Att registrera tid ska kosta ett
 * tryck och ingenting mer — en kod där hade gjort att folk slutade stämpla.
 * Ett flexsaldo är något annat: det är en uppgift om en enskild person, och
 * skärmen står i en verkstad där vem som helst går förbi.
 *
 * SVARAR ALDRIG MED NÅGOT ANNAT ÄN SALDOT. Inget namn, inget om personen,
 * ingen uppgift om huruvida koden ens är satt för någon annan.
 *
 * Gissningar bromsas med samma räknare som inloggningarna: fem försök per
 * anställd, sedan en kvarts paus. En fyrsiffrig kod går annars att prova sig
 * igenom på en kafferast.
 */

export const runtime = "nodejs";

const THROTTLE_SCOPE = "kiosk-flex";

interface FlexBody {
  employeeId?: string;
  code?: string;
}

export async function POST(request: NextRequest) {
  const session = await getKioskSession();

  if (!session) {
    return NextResponse.json(
      { error: "Skärmen är inte kopplad." },
      { status: 401 }
    );
  }

  // Flexsaldot hör till löneunderlaget. Utan modulen finns ingen knapp på
  // skärmen, och ett anrop kan bara komma från en flik som stått öppen sedan
  // modulen stängdes av.
  if (!(await hasModule(session.companyId, "PAYROLL"))) {
    return NextResponse.json({ error: "Okänd begäran." }, { status: 404 });
  }

  let body: FlexBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Trasigt anrop." }, { status: 400 });
  }

  const employeeId = String(body.employeeId ?? "");
  const code = String(body.code ?? "").trim();

  if (!employeeId || !code) {
    return NextResponse.json({ error: "Ange din kod." }, { status: 400 });
  }

  if (isLockedOut(THROTTLE_SCOPE, employeeId)) {
    return NextResponse.json(
      { error: "För många försök. Vänta en kvart och försök igen." },
      { status: 429 }
    );
  }

  const db = forCompany(session.companyId);

  const employee = await db.employee.findFirst({
    where: { id: employeeId, active: true },
    select: { id: true, flexCodeHash: true },
  });

  // Samma svar oavsett om personen saknas, är avaktiverad, saknar kod eller
  // angav fel kod. Skärmen ska inte gå att använda för att ta reda på vilka
  // som har en kod satt.
  if (!employee?.flexCodeHash || !(await bcrypt.compare(code, employee.flexCodeHash))) {
    noteFailedLogin(THROTTLE_SCOPE, employeeId);
    return NextResponse.json({ error: "Fel kod." }, { status: 401 });
  }

  clearFailedLogins(THROTTLE_SCOPE, employeeId);

  const minutes = await currentFlexMinutes(
    db,
    await companyTimeZone(session.companyId),
    employeeId
  );

  return NextResponse.json(
    { minutes },
    { headers: { "cache-control": "no-store" } }
  );
}
