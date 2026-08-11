"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";

const PATH = "/admin/kom-igang";

function revalidateAll() {
  revalidatePath(PATH);
  revalidatePath("/admin");
}

/** Delar upp en textruta i rader och rensar bort tomma och dubbletter. */
function readLines(value: FormDataEntryValue | null): string[] {
  const lines = String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set(lines)];
}

/**
 * Flera anställda i ett svep.
 *
 * Ett namn i taget med en knapptryckning emellan är det som får folk att ge
 * upp halvvägs. Här klistrar man in listan man ändå har.
 */
export async function addEmployees(formData: FormData) {
  const { db, companyId } = await requireAdmin();

  const names = readLines(formData.get("names"));
  if (names.length === 0) return;

  const existing = await db.employee.findMany({ select: { name: true } });
  const taken = new Set(existing.map((employee) => employee.name));

  const fresh = names.filter((name) => !taken.has(name));
  if (fresh.length === 0) return;

  await db.employee.createMany({
    data: fresh.map((name) => ({ companyId, name })),
  });

  revalidateAll();
}

export async function addMoments(formData: FormData) {
  const { db, companyId } = await requireAdmin();

  // Både förvalda förslag och egna rader hamnar i samma lista.
  const picked = formData.getAll("suggested").map(String);
  const typed = readLines(formData.get("names"));
  const names = [...new Set([...picked, ...typed])].filter(Boolean);
  if (names.length === 0) return;

  const existing = await db.workMoment.findMany({ select: { name: true } });
  const taken = new Set(existing.map((moment) => moment.name));

  const fresh = names.filter((name) => !taken.has(name));
  if (fresh.length === 0) return;

  await db.workMoment.createMany({
    data: fresh.map((name) => ({ companyId, name })),
  });

  revalidateAll();
}

export async function addOrder(formData: FormData) {
  const { db, companyId } = await requireAdmin();

  const orderNumber = String(formData.get("orderNumber") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  if (!orderNumber) return;

  const clash = await db.order.findFirst({ where: { orderNumber } });
  if (clash) return;

  await db.order.create({
    data: { companyId, orderNumber, customerName: customerName || null },
  });

  revalidateAll();
}
