import Link from "next/link";
import { notFound } from "next/navigation";
import { unsafeGlobalPrisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { parseBenefits, parseSpecs, type ProductKind } from "@/lib/shop/catalog";
import { imageSrc } from "@/lib/shop/products";
import { formatDateTime } from "@/lib/format";
import ProductForm from "@/components/platform/ProductForm";
import ProductImages from "@/components/platform/ProductImages";
import ActionDialog from "@/components/ui/ActionDialog";
import { PageHeader } from "@/components/ui";
import { deleteProductAction, type ProductFormState } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produkt · Tikkr" };

/**
 * EN PRODUKT: texterna, priset, synligheten och bilderna.
 *
 * Ta bort finns bara för en produkt som aldrig beställts. En beställd
 * produkt döljs med kryssen i stället, se product-admin.ts.
 */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;

  const product = await unsafeGlobalPrisma.shopProduct.findUnique({
    where: { id },
    include: { images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (!product) notFound();

  const ordered = await unsafeGlobalPrisma.shopOrderLine.count({
    where: { productKey: product.key },
  });

  const price = product.priceOre / 100;

  return (
    <>
      <PageHeader
        title={product.name}
        description={`Ändrad ${formatDateTime(product.updatedAt)} av ${product.updatedByEmail}`}
        action={
          <div className="flex flex-wrap items-center gap-4">
            {product.onSite && (
              <a
                href={`/tillbehor/${product.slug}`}
                target="_blank"
                rel="noopener"
                className="text-[13px] font-medium text-link hover:underline"
              >
                Visa på säljsidan
              </a>
            )}
            <Link
              href="/plattform/produkter"
              className="text-[13px] font-medium text-link hover:underline"
            >
              Till produkterna
            </Link>
          </div>
        }
      />

      <div className="max-w-4xl space-y-6">
        <ProductImages
          productId={product.id}
          images={product.images.map((image) => ({
            id: image.id,
            src: imageSrc(image),
            alt: image.alt,
            illustration: image.illustration,
            isStatic: Boolean(image.staticPath),
          }))}
        />

        {/* Nyckeln ritar om formuläret efter en sparning, så att fälten och
            listorna visar det som sparades. Se ProductForm. */}
        <ProductForm
          key={product.updatedAt.getTime()}
          product={{
            id: product.id,
            name: product.name,
            slug: product.slug,
            kind: product.kind as ProductKind,
            summary: product.summary,
            description: product.description,
            price: Number.isInteger(price) ? String(price) : price.toFixed(2).replace(".", ","),
            vatRatePercent: product.vatRatePercent,
            maxQuantity: product.maxQuantity,
            delivery: product.delivery,
            warranty: product.warranty,
            benefits: parseBenefits(product.benefits),
            included: product.included,
            requirements: product.requirements,
            specs: parseSpecs(product.specs),
            inShop: product.inShop,
            onSite: product.onSite,
            sortOrder: product.sortOrder,
          }}
        />

        <div className="border-t border-neutral-200 pt-6">
          {ordered > 0 ? (
            <p className="text-[13px] text-neutral-500">
              Finns i {ordered} {ordered === 1 ? "beställning" : "beställningar"} och kan inte
              tas bort. Dölj den genom att kryssa ur butiken och säljsidan.
            </p>
          ) : (
            <ActionDialog<ProductFormState>
              trigger="Ta bort produkten"
              triggerTone="danger"
              title={`Ta bort ${product.name}?`}
              description="Produkten och dess bilder tas bort. Kan inte ångras."
              action={deleteProductAction}
              initial={{}}
              submitLabel="Ta bort"
              submitTone="danger"
            >
              <input type="hidden" name="id" value={product.id} />
            </ActionDialog>
          )}
        </div>
      </div>
    </>
  );
}
