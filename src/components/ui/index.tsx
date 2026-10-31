import type { ComponentProps } from "react";
import {
  CardHeader as BaseCardHeader,
  PageHeader as BasePageHeader,
} from "@terafalk/ui";
import HelpLink from "@/components/help/HelpLink";
import type { GuideSlug } from "@/lib/help/guides";

/**
 * DESIGNSYSTEMET. Ligger i @terafalk/ui, se tf-framework. Här står det som är
 * Tikkrs: rubrikernas hjälplänk tar en `GuideSlug`, så att en länk till en guide
 * som inte finns inte går att bygga. Se CLAUDE.md § 3.3.
 */
export * from "@terafalk/ui";

type Help = { help?: GuideSlug };

export function PageHeader({
  help,
  ...props
}: Omit<ComponentProps<typeof BasePageHeader>, "help"> & Help) {
  return (
    <BasePageHeader {...props} help={help && <HelpLink guide={help} />} />
  );
}

export function CardHeader({
  help,
  ...props
}: Omit<ComponentProps<typeof BaseCardHeader>, "help"> & Help) {
  return (
    <BaseCardHeader
      {...props}
      help={help && <HelpLink guide={help} className="-my-1" />}
    />
  );
}
