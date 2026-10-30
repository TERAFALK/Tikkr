import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { KIND_LABEL } from "@/lib/shop/catalog";
import { listProducts } from "@/lib/shop/products";
import { formatCurrency } from "@/lib/money";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produkter · Tikkr" };

/**
 * BUTIKENS PRODUKTER (2026-10-21).
 *
 * Allt som säljs i butiken och visas på säljsidan läggs upp här. En ny
 * produkt är dold tills den kryssas i för butiken eller säljsidan, så att
 * den går att förbereda i lugn och ro. Se CLAUDE.md § 3.4.
 */
export default async function ProductsPage() {
  await requirePlatformAdmin();
  const products = await listProducts("all");

  return (
    <>
      <PageHeader
        title="Produkter"
        action={<ButtonLink href="/plattform/produkter/ny">Ny produkt</ButtonLink>}
      />

      {products.length === 0 ? (
        <EmptyState title="Inga produkter" />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Produkt</Th>
                <Th>Typ</Th>
                <Th numeric>Pris exkl. moms</Th>
                <Th>Syns</Th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <Tr key={product.id} dimmed={!product.inShop && !product.onSite}>
                  <Td>
                    <Link
                      href={`/plattform/produkter/${product.id}`}
                      className="font-medium text-link"
                    >
                      {product.name}
                    </Link>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      /tillbehor/{product.slug}
                    </span>
                  </Td>
                  <Td muted>{KIND_LABEL[product.kind]}</Td>
                  <Td numeric>{formatCurrency(product.priceOre)}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {product.inShop && <Badge tone="active">Butiken</Badge>}
                      {product.onSite && <Badge tone="active">Säljsidan</Badge>}
                      {!product.inShop && !product.onSite && <Badge tone="muted">Dold</Badge>}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
