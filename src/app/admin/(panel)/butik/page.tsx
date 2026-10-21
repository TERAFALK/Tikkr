import { isOwner, requireAdmin } from "@/lib/admin-session";
import { cartFromParams } from "@/lib/shop/cart";
import { allProducts } from "@/lib/shop/catalog";
import { shopPrices } from "@/lib/shop/prices";
import ShopCatalog from "@/components/admin/ShopCatalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Butik · Tikkr" };

/**
 * PRODUKTERNA. Inget formulär här: man väljer först, och fyller i
 * uppgifterna i kassan.
 */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const [params, prices] = await Promise.all([searchParams, shopPrices()]);

  const products = allProducts().map((product) => ({
    key: product.key,
    kind: product.kind,
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    priceOre: prices[product.key],
    maxQuantity: product.maxQuantity,
    delivery: product.delivery,
    image: product.images[0] ?? null,
  }));

  return (
    <ShopCatalog
      products={products}
      initialCart={cartFromParams(params)}
      canOrder={isOwner(session) && !session.support}
    />
  );
}
