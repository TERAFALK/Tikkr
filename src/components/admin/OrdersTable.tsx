"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import type { BulkCloseState } from "@/app/admin/(panel)/ordrar/actions";
import { ExportGroup, ExportLink } from "./ExportButtons";
import PrintButton from "./PrintButton";
import AskDialog from "@/components/ui/AskDialog";
import type { OrderRow } from "@/lib/orders";
import BudgetBar from "./BudgetBar";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDuration } from "@/lib/format";

/**
 * Orderlistan med markeringsläge.
 *
 * Kryssrutorna syns bara när man bett om dem. En kolumn med rutor som alltid
 * står tom är brus i en lista man mest bläddrar i — och den skjuter dessutom
 * ordernumret åt sidan, vilket är det man letar efter.
 *
 * Både öppna och stängda ordrar går att exportera. En färdig order är ofta
 * den man vill titta på: "hur lång tid tog ett liknande jobb förra gången".
 *
 * EFTERKALKYLEN FINNS ÄVEN HÄR sedan 2026-09-29. Den låg bara i menyn på en
 * enskild order, vilket betydde tjugo besök i tjugo menyer för en vecka av
 * färdiga jobb. Utskriften tar alla markerade i ett svep, och nedladdningen
 * ger en fil per order.
 *
 * ORDERNUMRET ÖPPNAR ORDERN (ändrat 2026-10-30). Det öppnade en meny, nu en
 * egen sida som en kund har. Se ordrar/[orderId]/page.tsx.
 */

export default function OrdersTable({
  orders,
  title,
  hideCustomer = false,
  selectable = true,
  closeAction,
  query = "",
  search,
}: {
  orders: OrderRow[];
  /** Rubrik över tabellen. Utelämnad ger antalet ordrar. */
  title?: string;
  /**
   * Döljer kundkolumnen. Sätts på en kunds egen sida, där varje rad har samma
   * kund och kolumnen bara upprepar sidans rubrik.
   */
  hideCustomer?: boolean;
  /**
   * Döljer markeringsläget och dess uttag. Sätts på granskningssidan, där
   * listan är en uppgift att beta av och inte ett urval att exportera.
   */
  selectable?: boolean;
  /**
   * Avslutar flera markerade ordrar. Utelämnad döljer frågan helt, vilket
   * gäller listan på granskningssidan där inget markeringsläge finns.
   */
  closeAction?: (
    state: BulkCloseState,
    formData: FormData
  ) => Promise<BulkCloseState>;
  /** Sökningen som gäller nu. Ändrar rubriken och det tomma läget. */
  query?: string;
  /**
   * Sökrutan. Göms i markeringsläget: en sökning laddar om sidan, och den som
   * markerat tio ordrar ska inte tappa dem på vägen.
   */
  search?: ReactNode;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Frågan om att avsluta de markerade ordrarna, som ställs när en
  // efterkalkyl tagits ut. Samma fråga som för en enskild order, se
  // OrderActions.
  const [asking, setAsking] = useState(false);

  // Reserven gör ingenting och används aldrig: knappen som leder hit finns
  // bara i markeringsläget, och det läget finns bara där åtgärden skickats
  // in. useActionState kräver ändå en funktion.
  const [closeState, submitClose] = useActionState<BulkCloseState, FormData>(
    closeAction ?? (async () => ({})),
    {}
  );

  function askToClose() {
    if (selected.size > 0) setAsking(true);
  }

  function confirmClose() {
    const data = new FormData();
    for (const id of selected) data.append("order", id);

    setAsking(false);
    submitClose(data);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  function exportUrl(format: "pdf" | "excel" | "kalkyl") {
    const params = new URLSearchParams();
    for (const id of selected) params.append("order", id);
    params.set("format", format);
    return `/api/admin/export/orders?${params.toString()}`;
  }

  const count = selected.size;

  return (
    <Card>
      <CardHeader
        title={
          title ??
          (query
            ? `${orders.length} ${orders.length === 1 ? "träff" : "träffar"}`
            : `${orders.length} ${orders.length === 1 ? "order" : "ordrar"}`)
        }
        /* SÄGER ATT DET BLIR ETT ZIP-ARKIV, och vad som ligger i det.
           
           Stod "Varje order blir en egen fil", vilket är sant men inte vad
           man ser: nedladdningen är EN fil som heter .zip, och kunden hörde
           av sig och undrade om det inte skulle bli flera PDF:er. Det blir
           det — de ligger inuti.
           
           Bara när flera är markerade. En enda order kommer som en vanlig
           PDF, och då finns ingenting att förklara. */
        description={
          selecting && count > 1
            ? "Du får en PDF per order, samlade i ett zip-arkiv."
            : query
              ? `Sökning på ”${query}”`
              : undefined
        }
        action={
          selecting ? (
            <div className="flex flex-wrap items-end justify-end gap-2">
              <span className="pb-1.5 text-[13px] tabular-nums text-neutral-500">
                {count} {count === 1 ? "vald" : "valda"}
              </span>

              {/* TVÅ DOKUMENT, TVÅ VÄGAR VAR.
                  
                  Knapparna hette "Skriv ut efterkalkyl", "Efterkalkyl" och
                  "Underlag", och det gick inte att se att de två sista var
                  nedladdningar eller att underlaget också gick att skriva ut.
                  Nu står dokumentets namn som etikett och verben under det.
                  
                  Efterkalkylen är INTERN och underlaget är kundens. Därför
                  skiljelinjen mellan grupperna: två knappar bredvid varandra
                  ska inte se ut som två varianter av samma sak. */}
              <ExportGroup label="Efterkalkyl">
                <PrintButton
                  href={exportUrl("kalkyl")}
                  label="Skriv ut"
                  disabled={count === 0}
                  onPrint={askToClose}
                />
                <ExportLink
                  href={exportUrl("kalkyl")}
                  disabled={count === 0}
                  onPick={askToClose}
                >
                  Ladda ner
                </ExportLink>
              </ExportGroup>

              <span
                aria-hidden="true"
                className="mx-1 h-8 w-px bg-neutral-200"
              />

              <ExportGroup label="Underlag">
                <PrintButton
                  href={exportUrl("pdf")}
                  label="Skriv ut"
                  disabled={count === 0}
                />
                <ExportLink
                  href={exportUrl("pdf")}
                  disabled={count === 0}
                  primary
                >
                  Ladda ner
                </ExportLink>
              </ExportGroup>
              <Button type="button" tone="ghost" onClick={stopSelecting}>
                Avbryt
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {search}
              {selectable && orders.length > 0 && (
                <Button
                  type="button"
                  tone="secondary"
                  onClick={() => setSelecting(true)}
                >
                  Markera ordrar
                </Button>
              )}
            </div>
          )
        }
      />

      {/* Svaret på frågan om att avsluta. Står i listan och inte i en ruta
          som måste tryckas bort: det är ett kvitto, inte ett beslut. */}
      {(closeState.ok || closeState.error) && (
        <p
          className={`border-b border-neutral-200 px-5 py-3 text-[13px] ${
            closeState.error ? "text-red-600" : "text-neutral-600"
          }`}
        >
          {closeState.error ?? closeState.ok}
        </p>
      )}

      <AskDialog
        open={asking}
        title={
          selected.size === 1
            ? "Avsluta ordern?"
            : `Avsluta ${selected.size} ordrar?`
        }
        confirmLabel="Ja, avsluta"
        onConfirm={confirmClose}
        onClose={() => setAsking(false)}
      >
        Ordrarna döljs på stämplingsskärmen. Den registrerade tiden finns
        kvar, och en order med pågående stämplingar står kvar öppen.
      </AskDialog>

      {orders.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-neutral-500">
          Ingen order matchar ”{query}”. Sökningen tittar på ordernummer, kund
          och kundnummer.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              {selecting && (
                <Th>
                  <span className="sr-only">Markera</span>
                </Th>
              )}
              <Th>Order</Th>
              {!hideCustomer && <Th>Kund</Th>}
              <Th>Status</Th>
              <Th numeric>Stämplingar</Th>
              <Th numeric>Upparbetad tid (timmar)</Th>
              <Th>Mot beräknad tid</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const isOpen = order.status === "OPEN";

              return (
                <Tr key={order.id} dimmed={!isOpen}>
                  {selecting && (
                    <Td>
                      <input
                        type="checkbox"
                        checked={selected.has(order.id)}
                        onChange={() => toggle(order.id)}
                        aria-label={`Markera order ${order.orderNumber}`}
                        className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
                      />
                    </Td>
                  )}

                  <Td>
                    {selecting ? (
                      <span className="font-medium">{order.orderNumber}</span>
                    ) : (
                      <Link
                        href={`/admin/ordrar/${order.id}`}
                        className="font-medium text-tick-deep hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    )}
                    {/* Brickan sitter på ordern och inte på kunden: ett
                        snabbjobb saknar ofta kund, och kolumnen finns inte alls
                        på kundens sida. */}
                    {order.isQuickJob && (
                      <span className="ml-2">
                        <Badge tone="warning">Snabbjobb</Badge>
                      </span>
                    )}
                  </Td>

                  {!hideCustomer && <Td muted>{order.customerName ?? "—"}</Td>}
                  <Td>
                    {isOpen ? (
                      <Badge tone="active">Öppen</Badge>
                    ) : (
                      <Badge tone="muted">Stängd</Badge>
                    )}
                  </Td>
                  <Td numeric muted>
                    {order.entries}
                  </Td>
                  <Td numeric>{formatDuration(order.minutes)}</Td>
                  <Td>
                    <BudgetBar
                      budgetMinutes={order.budgetMinutes}
                      usedMinutes={order.minutes}
                    />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
