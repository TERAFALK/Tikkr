import { requireAdmin } from "@/lib/admin-session";
import ShopTabs from "@/components/admin/ShopTabs";
import { PageHeader } from "@/components/ui";

/**
 * BUTIKEN (2026-10-21).
 *
 * Tikkrs tillbehör och tjänster, på en egen sida och inte under
 * Inställningar: ett köp är inte en inställning, och en utbildning är inte
 * ett tillbehör. Den nås från ikonen i menyns fot, bredvid Nyheter och
 * Hjälp, och från knappar där behovet uppstår. Se CLAUDE.md § 3.4.
 */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <>
      <PageHeader title="Butik" />
      <ShopTabs />
      {children}
    </>
  );
}
