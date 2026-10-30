import { requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { unsafeGlobalPrisma } from "@/lib/db";
import ConfirmButton from "@/components/admin/ConfirmButton";
import ActionDialog from "@/components/ui/ActionDialog";
import SaveForm from "@/components/admin/SaveForm";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import {
  addAbsenceReason,
  addDefaultAbsenceReasons,
  moveAbsenceReason,
  renameAbsenceReason,
  toggleAbsenceReason,
  type ReasonState,
} from "./actions";

export const metadata = { title: "Frånvaroorsaker · Tikkr" };

/**
 * FRÅNVAROORSAKER.
 *
 * Kundens egen lista. Ordningen är den i rullgardinen när frånvaro
 * registreras, så den vanligaste orsaken ska gå att få först.
 *
 * Hör till löneunderlaget och är grindad därefter: frånvaro finns bara i
 * tidrapporten, som är modulens egen sida.
 */

export const dynamic = "force-dynamic";

export default async function AbsenceReasonsPage() {
  const session = await requireAdmin();
  await requireModule(session, "PAYROLL");

  const { db } = session;

  // Kryssrutan för ATF visas bara när företaget valt ett avtal. Utan avtal
  // räknas ingen ATF, och rutan hade varit ett val utan verkan.
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: session.companyId },
    select: { atfAgreement: true },
  });
  const atf = Boolean(company?.atfAgreement);

  const reasons = await db.absenceReason.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      active: true,
      countsAsComp: true,
      givesAtf: true,
      _count: { select: { absences: true } },
    },
  });

  // ActionDialog: ett namn som redan finns ska svara i
  // rutan i stället för att stänga den som om allt gått bra.
  const newReason = (
    <ActionDialog<ReasonState>
      trigger="Ny orsak"
      title="Lägg till frånvaroorsak"
      action={addAbsenceReason}
      initial={{}}
      submitLabel="Lägg till"
    >
      <Field label="Namn">
        <Input name="name" placeholder="Arbetsskada" required autoFocus />
      </Field>

      {/* Den här rutan styr en räkning och inte en etikett, och den är därför
          den enda på sidan som behöver en förklaring. */}
      <label className="flex cursor-pointer items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          name="countsAsComp"
          className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
        />
        <span>
          <span className="block font-medium text-neutral-900">
            Drar på flexsaldot
          </span>
          <span className="block text-neutral-500">
            För flexledighet. Frånvaron minskar då flexsaldot i stället för
            att täcka den planerade tiden
          </span>
        </span>
      </label>

      {atf && <GivesAtfBox defaultChecked={false} />}
    </ActionDialog>
  );

  return (
    <Card>
      <CardHeader title="Frånvaroorsaker" help="franvaro" action={newReason} />

      {reasons.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="Inga frånvaroorsaker upplagda"
            description="Utan orsaker går det inte att registrera frånvaro i tidrapporten."
            action={
              <SaveForm
                action={addDefaultAbsenceReasons}
                submitLabel="Lägg till de vanliga"
                className="space-y-3"
              >
                <p className="text-[13px] text-neutral-600">
                  Sjuk, vård av barn, semester, föräldraledig, tjänstledig,
                  permission, flexledig och övrigt. Går att ändra efteråt.
                </p>
              </SaveForm>
            }
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Namn</Th>
              <Th>Status</Th>
              <Th numeric>Registrerade</Th>
              <Th>
                <span className="sr-only">Ordning</span>
              </Th>
              <Th>
                <span className="sr-only">Åtgärd</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {reasons.map((reason, index) => (
              <Tr key={reason.id} dimmed={!reason.active}>
                <Td>
                  <span className="font-medium">{reason.name}</span>
                  {reason.countsAsComp && (
                    <span className="ml-2">
                      <Badge>Drar på flexsaldot</Badge>
                    </span>
                  )}
                  {atf && reason.givesAtf && !reason.countsAsComp && (
                    <span className="ml-2">
                      <Badge>Ger ATF</Badge>
                    </span>
                  )}
                </Td>

                <Td>
                  {reason.active ? (
                    <Badge tone="active">Aktiv</Badge>
                  ) : (
                    <Badge tone="muted">Avaktiverad</Badge>
                  )}
                </Td>

                <Td numeric muted>
                  {reason._count.absences}
                </Td>

                <Td>
                  <div className="flex justify-end gap-1">
                    <MoveButton
                      id={reason.id}
                      direction="up"
                      disabled={index === 0}
                    />
                    <MoveButton
                      id={reason.id}
                      direction="down"
                      disabled={index === reasons.length - 1}
                    />
                  </div>
                </Td>

                <Td>
                  <div className="flex items-center justify-end gap-2">
                    {/* ActionDialog: ett namn som redan
                        finns ska svara inuti rutan. */}
                    <ActionDialog<ReasonState>
                      trigger="Ändra"
                      triggerTone="secondary"
                      title={`Ändra ${reason.name}`}
                      action={renameAbsenceReason}
                      initial={{}}
                      submitLabel="Spara"
                    >
                      <input type="hidden" name="id" value={reason.id} />

                      <Field label="Namn">
                        <Input
                          name="name"
                          defaultValue={reason.name}
                          required
                          autoFocus
                        />
                      </Field>

                      {/* Inte för en orsak som drar på flexen: den ledigheten
                          syns redan i flexen, och ATF räknas på flexen. */}
                      {atf && !reason.countsAsComp && (
                        <GivesAtfBox defaultChecked={reason.givesAtf} />
                      )}
                    </ActionDialog>

                    <form action={toggleAbsenceReason}>
                      <input type="hidden" name="id" value={reason.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={String(reason.active)}
                      />
                      <ConfirmButton
                        type="submit"
                        tone={reason.active ? "danger" : "secondary"}
                        question={
                          reason.active
                            ? `Avaktivera ${reason.name}? Den går då inte att välja, och registrerad frånvaro finns kvar.`
                            : `Aktivera ${reason.name} igen?`
                        }
                      >
                        {reason.active ? "Avaktivera" : "Aktivera"}
                      </ConfirmButton>
                    </form>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

/**
 * KRYSSRUTAN "GER ATF". Kundens eget val per orsak: avtalen säger olika om
 * vilken frånvaro som räknas som arbetad tid när ATF tjänas in. Se atf.ts.
 *
 * Får ändras i efterhand, till skillnad från "Drar på flexsaldot". ATF är ett
 * underlag som räknas fram vid varje utskrift, inte ett saldo som byggts upp.
 */
function GivesAtfBox({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[13px]">
      {/* Skickas alltid, så att ett urkryss går att skilja från en ruta som
          inte visades alls. */}
      <input type="hidden" name="givesAtfShown" value="1" />
      <input
        type="checkbox"
        name="givesAtf"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
      />
      <span>
        <span className="block font-medium text-neutral-900">Ger ATF</span>
        <span className="block text-neutral-500">
          Frånvaron räknas som arbetad tid för arbetstidsförkortningen
        </span>
      </span>
    </label>
  );
}

/** Pilen som flyttar en orsak i listan. */
function MoveButton({
  id,
  direction,
  disabled,
}: {
  id: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={moveAbsenceReason}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <Button
        type="submit"
        tone="ghost"
        disabled={disabled}
        aria-label={direction === "up" ? "Flytta upp" : "Flytta ned"}
      >
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {direction === "up" ? (
            <path d="M10 15V5m0 0-4 4m4-4 4 4" />
          ) : (
            <path d="M10 5v10m0 0 4-4m-4 4-4-4" />
          )}
        </svg>
      </Button>
    </form>
  );
}
