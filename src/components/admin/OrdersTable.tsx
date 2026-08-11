"use client";

import { useState } from "react";
import OrderActions from "./OrderActions";
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
 */

export interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string | null;
  status: string;
  entries: number;
  minutes: number;
}

export default function OrdersTable({
  orders,
  updateAction,
  toggleAction,
}: {
  orders: OrderRow[];
  updateAction: (formData: FormData) => void | Promise<void>;
  toggleAction: (formData: FormData) => void | Promise<void>;
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

  function exportUrl(format: "pdf" | "excel") {
    const params = new URLSearchParams();
    for (const id of selected) params.append("order", id);
    params.set("format", format);
    return `/api/admin/export/orders?${params.toString()}`;
  }

  const count = selected.size;

  return (
    <Card>
      <CardHeader
        title={`${orders.length} ${orders.length === 1 ? "order" : "ordrar"}`}
        description={
          selecting
            ? "Markera de ordrar du vill ha underlag för. En PDF får en order per sida, en Excel en flik per order."
            : "Klicka på ett ordernummer för underlag och ändringar."
        }
        action={
          selecting ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] tabular-nums text-neutral-500">
                {count} {count === 1 ? "vald" : "valda"}
              </span>
              <a
                href={count > 0 ? exportUrl("pdf") : undefined}
                onClick={(event) => {
                  if (count === 0) event.preventDefault();
                }}
                aria-disabled={count === 0}
                className={`inline-flex items-center rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  count === 0
                    ? "cursor-not-allowed bg-neutral-100 text-neutral-400"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                PDF
              </a>
              <a
                href={count > 0 ? exportUrl("excel") : undefined}
                onClick={(event) => {
                  if (count === 0) event.preventDefault();
                }}
                aria-disabled={count === 0}
                className={`inline-flex items-center rounded-md px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors ${
                  count === 0
                    ? "cursor-not-allowed text-neutral-400 ring-neutral-200"
                    : "bg-white text-neutral-700 ring-neutral-200 hover:bg-neutral-50"
                }`}
              >
                Excel
              </a>
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
            <Th>Kund</Th>
            <Th>Status</Th>
            <Th numeric>Stämplingar</Th>
            <Th numeric>Upparbetad tid</Th>
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
                      updateAction={updateAction}
                      toggleAction={toggleAction}
                    />
                  )}
                </Td>

                <Td muted>{order.customerName ?? "—"}</Td>
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
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
