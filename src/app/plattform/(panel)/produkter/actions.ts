"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  createProduct,
  deleteProduct,
  deleteProductImage,
  moveProductImage,
  ProductError,
  readProductForm,
  updateProduct,
  updateProductImage,
} from "@/lib/shop/product-admin";

/**
 * PLATTFORMENS ÅTGÄRDER FÖR BUTIKENS PRODUKTER.
 *
 * Varje åtgärd prövar behörigheten själv. Reglerna ligger i
 * src/lib/shop/product-admin.ts; här läses formuläret och sidorna som visar
 * produkten byggs om.
 */

export interface ProductFormState {
  error?: string;
  ok?: string;
}

/** Sidorna som visar produkterna. Säljsidan byggs annars om var minut. */
function refreshShop(slugs: string[]) {
  revalidatePath("/plattform/produkter");
  revalidatePath("/admin/butik");
  revalidatePath("/tillbehor");
  revalidatePath("/");
  for (const slug of slugs) revalidatePath(`/tillbehor/${slug}`);
}

/** Skapar en produkt, eller ändrar en när formuläret bär ett id. */
export async function saveProductAction(
  _previous: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const { email } = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");

  const { input, error } = readProductForm(formData);
  if (!input) return { error };

  if (!id) {
    let created: string;
    try {
      created = await createProduct(input, email);
    } catch (caught) {
      if (caught instanceof ProductError) return { error: caught.message };
      throw caught;
    }
    refreshShop([input.slug]);
    redirect(`/plattform/produkter/${created}`);
  }

  try {
    const { previousSlug } = await updateProduct(id, input, email);
    refreshShop([input.slug, previousSlug]);
    revalidatePath(`/plattform/produkter/${id}`);
  } catch (caught) {
    if (caught instanceof ProductError) return { error: caught.message };
    throw caught;
  }

  return { ok: "Produkten är sparad." };
}

export async function deleteProductAction(
  _previous: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const { email } = await requirePlatformAdmin();

  try {
    await deleteProduct(String(formData.get("id") ?? ""), email);
  } catch (caught) {
    if (caught instanceof ProductError) return { error: caught.message };
    throw caught;
  }

  refreshShop([]);
  redirect("/plattform/produkter");
}

export async function updateImageAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();

  const productId = await updateProductImage(String(formData.get("imageId") ?? ""), {
    alt: String(formData.get("alt") ?? "").trim(),
    illustration: formData.get("illustration") === "on",
  });

  revalidatePath(`/plattform/produkter/${productId}`);
  refreshShop([]);
}

export async function moveImageAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();

  const productId = await moveProductImage(
    String(formData.get("imageId") ?? ""),
    formData.get("direction") === "up" ? "up" : "down"
  );

  revalidatePath(`/plattform/produkter/${productId}`);
  refreshShop([]);
}

export async function deleteImageAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();

  const productId = await deleteProductImage(String(formData.get("imageId") ?? ""));

  revalidatePath(`/plattform/produkter/${productId}`);
  refreshShop([]);
}
