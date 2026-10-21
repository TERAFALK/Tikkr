import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { productBySlug } from "@/lib/shop/catalog";
import { shopPrices } from "@/lib/shop/prices";
import { withVat } from "@/lib/shop/pricing";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { Cta } from "@/components/marketing/Sections";
import { ProductFigure, kronor, orderHref } from "@/components/marketing/ShopParts";

/**
 * EN PRODUKT: BILDER, PRIS, FÖRDELAR, VAD SOM INGÅR OCH SPECIFIKATIONER.
 *
 * Allt läses ur katalogen. Priset står exklusive moms, som allt annat på
 * säljsidan, med beloppet inklusive moms under, eftersom en engångssumma av
 * den här storleken är något kunden ska kunna lägga fram för den som
 * godkänner köpet. Frakten tillkommer och står med liten text.
 *
 * Beställ leder genom inloggningen till Tillbehör i panelen. Beställningen
 * görs där, av arbetsytans ägare, med företagets uppgifter förifyllda.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const product = productBySlug((await params).slug);
  if (!product) return {};

  return pageMetadata({
    path: `/tillbehor/${product.slug}`,
    title: `${product.name} · Tikkr`,
    description: `${product.summary} ${product.delivery}`,
  });
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const product = productBySlug((await params).slug);
  if (!product) notFound();

  let priceOre: number | null = null;
  try {
    priceOre = (await shopPrices())[product.key];
  } catch (error) {
    // Hellre utan pris än med ett som kanske inte gäller. Se butikssidan.
    console.error("Kunde inte hämta priset", error);
  }

  const [main, ...more] = product.images;

  return (
    <div className="marketing-page bg-white">
      <SiteHeader />

      <main>
        <section className="border-b border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
            <nav aria-label="Brödsmulor" className="text-[13px] text-neutral-500">
              <Link href="/tillbehor" className="hover:text-neutral-900">
                Tillbehör
              </Link>{" "}
              / <span className="text-neutral-900">{product.name}</span>
            </nav>

            <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14">
              <div className="space-y-4">
                <ProductFigure image={main} priority />
                {more.length > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    {more.map((image) => (
                      <ProductFigure key={image.src} image={image} />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[40px]">
                  {product.name}
                </h1>
                <p className="mt-3 text-[16px] leading-relaxed text-neutral-600">
                  {product.summary}
                </p>

                <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6">
                  {priceOre !== null ? (
                    <>
                      <p className="text-[28px] font-semibold tabular-nums tracking-tight text-neutral-900">
                        {kronor(priceOre)}{" "}
                        <span className="text-[15px] font-normal text-neutral-500">
                          exkl. moms
                        </span>
                      </p>
                      <p className="mt-1 text-[14px] tabular-nums text-neutral-600">
                        {kronor(withVat(priceOre, product.vatRatePercent))} inkl. moms
                      </p>
                    </>
                  ) : (
                    <p className="text-[15px] text-neutral-600">
                      Priset går inte att visa just nu.
                    </p>
                  )}
                  <p className="mt-1 text-[12px] text-neutral-500">Frakt tillkommer.</p>

                  <p className="mt-5 text-[14px] leading-relaxed text-neutral-700">
                    {product.delivery}
                  </p>

                  <div className="mt-6">
                    <Cta href={orderHref(product.slug)}>Beställ</Cta>
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-neutral-500">
                    Beställs i panelen av arbetsytans ägare. Faktureras vid
                    leverans.
                  </p>
                </div>

                <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-neutral-600">
                  {product.description.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Fördelar
          </h2>
          <dl className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {product.benefits.map((benefit) => (
              <div key={benefit.title} className="border-t border-neutral-200 pt-4">
                <dt className="text-[15px] font-semibold text-neutral-900">{benefit.title}</dt>
                <dd className="mt-1.5 text-[14px] leading-relaxed text-neutral-600">
                  {benefit.body}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-neutral-200 bg-neutral-50">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 sm:py-20 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
                Det här ingår
              </h2>
              <ul className="mt-6 space-y-2.5 text-[15px] text-neutral-700">
                {product.included.map((item) => (
                  <ListItem key={item}>{item}</ListItem>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
                Det här behöver ni
              </h2>
              <ul className="mt-6 space-y-2.5 text-[15px] text-neutral-700">
                {product.requirements.map((item) => (
                  <ListItem key={item}>{item}</ListItem>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Specifikationer
          </h2>
          <div className="mt-8 grid gap-10 md:grid-cols-2">
            {product.specs.map((group) => (
              <div key={group.title}>
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-tick-deep">
                  {group.title}
                </h3>
                <dl className="mt-3">
                  {group.rows.map((row) => (
                    <div
                      key={row.label}
                      className="grid grid-cols-[10rem_1fr] gap-4 border-t border-neutral-200 py-2.5 text-[14px]"
                    >
                      <dt className="text-neutral-500">{row.label}</dt>
                      <dd className="text-neutral-900">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          <div className="mt-14 max-w-2xl border-t border-neutral-200 pt-6">
            <h2 className="text-lg font-semibold text-neutral-900">Garanti</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">
              {product.warranty}
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function ListItem({ children }: { children: string }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-2.5 h-px w-3 shrink-0 bg-tick-deep" />
      <span>{children}</span>
    </li>
  );
}
