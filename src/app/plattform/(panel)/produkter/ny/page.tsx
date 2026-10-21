import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import ProductForm from "@/components/platform/ProductForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ny produkt · Tikkr" };

/** En ny produkt. Bilderna läggs till när den är sparad. */
export default async function NewProductPage() {
  await requirePlatformAdmin();

  return (
    <>
      <PageHeader
        title="Ny produkt"
        description="Produkten är dold tills den kryssas i för butiken eller säljsidan. Bilder läggs till efter att den sparats."
        action={
          <Link
            href="/plattform/produkter"
            className="text-[13px] font-medium text-tick-deep hover:underline"
          >
            Till produkterna
          </Link>
        }
      />
      <div className="max-w-4xl">
        <ProductForm
          product={{
            id: null,
            name: "",
            slug: "",
            kind: "GOODS",
            summary: "",
            description: "",
            price: "",
            vatRatePercent: 25,
            maxQuantity: 20,
            delivery: "",
            warranty: "",
            benefits: [],
            included: [],
            requirements: [],
            specs: [],
            inShop: false,
            onSite: false,
            sortOrder: 0,
          }}
        />
      </div>
    </>
  );
}
