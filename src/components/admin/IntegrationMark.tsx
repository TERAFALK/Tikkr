import type { IntegrationProvider } from "@/lib/integrations/provider";

/**
 * Systemets logotyp på en vit ruta, eller två bokstäver när logotypen saknas.
 * Samma storlek på kortet i översikten och i integrationens sidhuvud.
 * Dekorativ: namnet står alltid bredvid.
 */
export default function IntegrationMark({ provider }: { provider: Pick<IntegrationProvider, "mark" | "logo"> }) {
  if (provider.logo) {
    return (
      <span aria-hidden className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white px-2">
        <img src={provider.logo} alt="" className="max-h-6 max-w-full object-contain" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-fjord text-[13px] font-semibold text-white"
    >
      {provider.mark}
    </span>
  );
}
