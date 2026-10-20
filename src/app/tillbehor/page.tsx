import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { allProducts } from "@/lib/shop/catalog";
import { shopPrices } from "@/lib/shop/prices";
import type { PriceList } from "@/lib/shop/pricing";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { ProductFigure, kronor } from "@/components/marketing/ShopParts";

/**
 * BUTIKEN: TILLBEHÖREN, EN RUTA PER PRODUKT.
 *
 * Ritas ur katalogen, så att en ny produkt är en post i catalog.ts och inte en
 * ny sida. Priset läses vid varje visning, eftersom det ändras i
 * plattformspanelen och ett pris bakat vid bygget vore ett annat än det
 * kunden sedan beställer till.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  path: "/tillbehor",
  title: "Tillbehör · Tikkr",
  description:
    "Stämplingsskärmar för Tikkr, uppsatta och provade före leverans. Tillverkas på beställning.",
});

export default async function ShopPage() {
  const prices = await pricesOrNone();

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
            {allProducts().map((product) => (
              <li key={product.key}>
                <Link
                  href={`/tillbehor/${product.slug}`}
                  className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
                >
                  <ProductFigure image={product.images[0]} priority />
                  <h2 className="mt-5 text-lg font-semibold text-neutral-900 group-hover:text-tick-deep">
                    {product.name}
                  </h2>
                  <p className="mt-1 text-[14px] leading-relaxed text-neutral-600">
                    {product.summary}
                  </p>
                  {prices && (
                    <p className="mt-3 text-[14px] text-neutral-900">
                      <span className="font-semibold tabular-nums">
                        {kronor(prices[product.key])}
                      </span>{" "}
                      <span className="text-neutral-500">exkl. moms</span>
                    </p>
                  )}
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
 * Priserna, eller inga alls.
 *
 * Säljsidan ska gå att läsa även när databasen inte svarar. Då visas
 * produkterna utan pris, hellre än med katalogens reservpris, som kan vara ett
 * annat än det som gäller.
 */
async function pricesOrNone(): Promise<PriceList | null> {
  try {
    return await shopPrices();
  } catch (error) {
    console.error("Kunde inte hämta tillbehörens priser", error);
    return null;
  }
}
