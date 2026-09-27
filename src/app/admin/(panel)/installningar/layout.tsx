import { requireAdmin } from "@/lib/admin-session";
import { enabledModules } from "@/lib/company-modules";
import SettingsNav from "@/components/admin/SettingsNav";
import { PageHeader } from "@/components/ui";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Undernavigeringen döljer sidor för moduler företaget inte har. Sidorna
  // bakom dem vaktas ändå av requireModule() — menyn är kosmetik, se
  // src/lib/company-modules.ts.
  const { companyId } = await requireAdmin();
  const modules = await enabledModules(companyId);

  return (
    <>
      <PageHeader
        title="Inställningar"
      />

      <div className="lg:flex lg:gap-8">
        <SettingsNav modules={modules} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
