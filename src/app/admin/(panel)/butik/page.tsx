import { isOwner, requireAdmin } from "@/lib/admin-session";
import { cartFromParams } from "@/lib/shop/cart";
import { listProducts } from "@/lib/shop/products";
import ShopCatalog from "@/components/admin/ShopCatalog";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Butik · Tikkr" };

/**
 * PRODUKTERNA. Inget formulär här: man väljer först, och fyller i
 * uppgifterna i kassan. Produkterna läggs upp under Produkter i
 * plattformspanelen, och bara de som ska synas i butiken visas.
 */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const [params, products] = await Promise.all([searchParams, listProducts("shop")]);

  if (products.length === 0) return <EmptyState title="Inga produkter" />;

  return (
    <ShopCatalog
      products={products.map((product) => ({
        key: product.key,
        kind: product.kind,
        slug: product.slug,
        name: product.name,
        summary: product.summary,
        priceOre: product.priceOre,
        maxQuantity: product.maxQuantity,
        delivery: product.delivery,
        image: product.images[0] ?? null,
        onSite: product.onSite,
      }))}
      initialCart={cartFromParams(params, products)}
      canOrder={isOwner(session) && !session.support}
    />
  );
}
