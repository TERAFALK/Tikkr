"use client";

import { useState } from "react";
import type {
  OrderFormState,
  OrderToggleState,
} from "@/app/admin/(panel)/ordrar/actions";
import OrderActions from "./OrderActions";
import PrintButton from "./PrintButton";
import type { SearchSelectOption } from "./SearchSelect";
import type { BudgetMomentOption } from "./BudgetMoments";
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
 */

export default function OrdersTable({
  orders,
  updateAction,
  toggleAction,
  customers,
  moments,
  title,
  hideCustomer = false,
}: {
  orders: OrderRow[];
  /** Kunderna som går att välja i ändra-rutan. */
  customers: SearchSelectOption[];
  /** Rubrik över tabellen. Utelämnad ger antalet ordrar. */
  title?: string;
  /**
   * Döljer kundkolumnen. Sätts på en kunds egen sida, där varje rad har samma
   * kund och kolumnen bara upprepar sidans rubrik.
   */
  hideCustomer?: boolean;
  /** Arbetsmomenten som går att beräkna tid på. */
  moments: BudgetMomentOption[];
  updateAction: (
    state: OrderFormState,
    formData: FormData
  ) => Promise<OrderFormState>;
  toggleAction: (
    state: OrderToggleState,
    formData: FormData
  ) => Promise<OrderToggleState>;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
          `${orders.length} ${orders.length === 1 ? "order" : "ordrar"}`
        }
        description={
          selecting
            ? "En fil per order i PDF, en flik per order i Excel."
            : undefined
        }
        action={
          selecting ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-[13px] tabular-nums text-neutral-500">
                {count} {count === 1 ? "vald" : "valda"}
              </span>

              {/* Utskriften först: det är den som gör att kalkylen kan tas ut
                  för en hel vecka utan att en enda fil sparas. */}
              <PrintButton
                href={exportUrl("kalkyl")}
                label="Skriv ut efterkalkyl"
                disabled={count === 0}
              />
              <ExportLink href={exportUrl("kalkyl")} disabled={count === 0}>
                Efterkalkyl
              </ExportLink>

              {/* Skiljer det interna från det kunden får se. Kalkylen bär
                  sitt svarta band på varje sida, men två knappar bredvid
                  varandra ska inte se ut som två varianter av samma sak. */}
              <span
                aria-hidden="true"
                className="mx-1 h-4 w-px bg-neutral-200"
              />

              <ExportLink
                href={exportUrl("pdf")}
                disabled={count === 0}
                primary
              >
                Underlag
              </ExportLink>
              <ExportLink href={exportUrl("excel")} disabled={count === 0}>
                Excel
              </ExportLink>
              <Button type="button" tone="ghost" onClick={stopSelecting}>
                Avbryt
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              tone="secondary"
              onClick={() => setSelecting(true)}
            >
              Markera ordrar
            </Button>
          )
        }
      />

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
            <Th numeric>Upparbetad tid (tim:min)</Th>
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
                    <OrderActions
                      order={order}
                      customers={customers}
                      moments={moments}
                      updateAction={updateAction}
                      toggleAction={toggleAction}
                    />
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
    </Card>
  );
}

/**
 * En nedladdningslänk i markeringsläget.
 *
 * Länk och inte knapp: filen hämtas av webbläsaren, och en länk går att öppna
 * i en ny flik som vilken annan. Utan markerade ordrar leder den ingenstans,
 * och ser ut därefter.
 */
function ExportLink({
  href,
  disabled,
  primary = false,
  children,
}: {
  href: string;
  disabled: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  const tone = disabled
    ? "cursor-not-allowed text-neutral-400 ring-1 ring-inset ring-neutral-200"
    : primary
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50";

  return (
    <a
      href={disabled ? undefined : href}
      onClick={(event) => {
        if (disabled) event.preventDefault();
      }}
      aria-disabled={disabled}
      className={`inline-flex items-center rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${tone}`}
    >
      {children}
    </a>
  );
}
