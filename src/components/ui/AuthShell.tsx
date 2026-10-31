import type { ComponentProps } from "react";
import BaseAuthShell from "@terafalk/ui/AuthShell";
import AuthBackdrop from "./AuthBackdrop";
import { Wordmark } from "./Logo";

/**
 * Skalet för inloggningens sidor. Ligger i @terafalk/ui, se tf-framework. Här står
 * Tikkrs märke och yta, se `AuthBackdrop` och CLAUDE.md § 7.2.
 */
export default function AuthShell(
  props: Omit<
    ComponentProps<typeof BaseAuthShell>,
    "logo" | "logoLabel" | "backdrop"
  >
) {
  return (
    <BaseAuthShell
      {...props}
      logo={<Wordmark size={30} tone="reversed" />}
      logoLabel="Tikkr"
      backdrop={<AuthBackdrop />}
    />
  );
}
