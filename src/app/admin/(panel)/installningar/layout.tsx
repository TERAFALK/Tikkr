import SettingsNav from "@/components/admin/SettingsNav";
import { PageHeader } from "@/components/ui";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader
        title="Inställningar"
        description="Gäller hela företaget och alla dess stämplingsskärmar."
      />

      <div className="lg:flex lg:gap-8">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
