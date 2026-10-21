import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import type { Product } from "@/lib/shop/catalog";
import { listProducts } from "@/lib/shop/products";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { ProductFigure, kronor } from "@/components/marketing/ShopParts";

/**
 * BUTIKEN: TILLBEHÖREN, EN RUTA PER PRODUKT.
 *
 * Ritas ur produkterna som ska synas på säljsidan, så att en ny produkt
 * läggs upp i plattformspanelen och inte är en ny sida. Läses vid varje
 * visning, eftersom pris och text ändras där och en sida bakad vid bygget
 * vore en annan än den kunden sedan beställer från.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  path: "/tillbehor",
  title: "Tillbehör · Tikkr",
  description:
    "Stämplingsskärmar för Tikkr, uppsatta och provade före leverans. Tillverkas på beställning.",
});

export default async function ShopPage() {
  const products = await productsOrNone();

  return (
    <div className="marketing-page bg-white">
      <SiteHeader />

      <main>
        <section className="border-b border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[44px]">
              Tillbehör
            </h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-neutral-600">
              Hårdvara för Tikkr, uppsatt och provad innan den levereras. Tikkr
              fungerar också på en egen dator eller surfplatta med pekskärm.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <li key={product.key}>
                <Link
                  href={`/tillbehor/${product.slug}`}
                  className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
                >
                  {product.images[0] && <ProductFigure image={product.images[0]} priority />}
                  <h2 className="mt-5 text-lg font-semibold text-neutral-900 group-hover:text-tick-deep">
                    {product.name}
                  </h2>
                  <p className="mt-1 text-[14px] leading-relaxed text-neutral-600">
                    {product.summary}
                  </p>
                  <p className="mt-3 text-[14px] text-neutral-900">
                    <span className="font-semibold tabular-nums">
                      {kronor(product.priceOre)}
                    </span>{" "}
                    <span className="text-neutral-500">exkl. moms</span>
                  </p>
                  <p className="mt-1 text-[13px] text-neutral-500">{product.delivery}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * Produkterna, eller inga alls.
 *
 * Säljsidan ska gå att läsa även när databasen inte svarar. Då står sidan
 * utan produkter, hellre än att inte gå att öppna.
 */
async function productsOrNone(): Promise<Product[]> {
  try {
    return await listProducts("site");
  } catch (error) {
    console.error("Kunde inte hämta butikens produkter", error);
    return [];
  }
}
