"use client";

import { useCallback, useEffect, useState } from "react";
import {
  sendFeedbackAction,
  type FeedbackFormState,
} from "@/app/admin/(panel)/feedback/actions";
import ActionDialog from "@/components/ui/ActionDialog";
import { Field, Select, Textarea } from "@/components/ui";
import { IconMessage } from "@/components/ui/icons";
import { HELP_AREAS, HELP_AREA_KEYS, areaForPath } from "@/lib/help/areas";
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_LABEL,
  MAX_BODY_LENGTH,
} from "@/lib/feedback-form";

/**
 * LÄMNA FEEDBACK: EN IKON I MENYNS FOT OCH EN LITEN RUTA (issue #8).
 *
 * En brevlåda och inget ärendesystem. Kunden skriver, trycker Skicka och får
 * en kvittens; svaret, om det blir något, kommer i en senare version. Se
 * feedback.ts.
 *
 * Underrubriken skickar den som behöver hjälp till hjälpcentret, eftersom ett
 * ärende som hamnar här aldrig blir besvarat. Länken är relativ av samma skäl
 * som i HelpLink.
 *
 * Sidan man står på följer med. Den förväljer området och sparas med
 * meddelandet, så att vi ser var felet uppstod utan att behöva fråga.
 */
export default function FeedbackButton({
  pathname,
  className,
}: {
  pathname: string;
  className: string;
}) {
  const [thanks, setThanks] = useState("");
  const area = areaForPath(pathname) ?? "";

  // Tacket står en stund och försvinner. Det är ett kvitto, inte ett läge.
  useEffect(() => {
    if (!thanks) return;
    const timer = setTimeout(() => setThanks(""), 5000);
    return () => clearTimeout(timer);
  }, [thanks]);

  const onDone = useCallback((ok: string) => setThanks(ok), []);

  return (
    <>
      <ActionDialog<FeedbackFormState>
        trigger={(open) => (
          <button
            type="button"
            onClick={open}
            className={className}
            aria-label="Lämna feedback"
            title="Lämna feedback"
          >
            <IconMessage />
          </button>
        )}
        title="Lämna feedback"
        description={
          <>
            För förbättringsförslag, synpunkter och mindre fel. Inget svar
            skickas. Behöver du hjälp, gå till{" "}
            <a
              href="/support"
              target="_blank"
              rel="noopener"
              className="font-medium text-tick-deep hover:underline"
            >
              supporten
            </a>
            .
          </>
        }
        action={sendFeedbackAction}
        initial={{}}
        submitLabel="Skicka"
        pendingLabel="Skickar…"
        onDone={onDone}
      >
        <input type="hidden" name="page" value={pathname} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Typ">
            <Select name="kind" defaultValue="BUG">
              {FEEDBACK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {FEEDBACK_KIND_LABEL[kind]}
                </option>
              ))}
            </Select>
          </Field>

          {/* Nyckeln byts med sidan. En select läser defaultValue bara när
              den skapas, och menyn ligger kvar medan man går mellan sidorna. */}
          <Field label="Område">
            <Select key={area} name="area" defaultValue={area}>
              {HELP_AREA_KEYS.map((key) => (
                <option key={key} value={key}>
                  {HELP_AREAS[key].label}
                </option>
              ))}
              <option value="">Annat</option>
            </Select>
          </Field>
        </div>

        <Field label="Meddelande">
          <Textarea name="body" rows={6} maxLength={MAX_BODY_LENGTH} required />
        </Field>
      </ActionDialog>

      {thanks && (
        <p
          role="status"
          className="absolute bottom-full right-0 mb-1 whitespace-nowrap rounded-md bg-fjord px-2 py-1 text-[11px] font-medium text-white shadow"
        >
          {thanks}
        </p>
      )}
    </>
  );
}
