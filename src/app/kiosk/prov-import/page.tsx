import ImportProbe from "./ImportProbe";

/**
 * Tillfälligt prov på stämplingsskärmen, se ImportProbe. Tas bort när
 * konfigurationerna är byggda.
 */
export const metadata = {
  title: "Prov · Tikkr",
  robots: { index: false, follow: false },
};

export default function ImportProbePage() {
  return <ImportProbe />;
}
