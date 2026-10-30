"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import AskDialog from "./AskDialog";

/**
 * FRÅGAR INNAN OSPARADE ÄNDRINGAR FÖRSVINNER.
 *
 * Ingenting varnade. Ett klick i menyn tog bort en hel veckas arbetstider, och
 * Escape stängde en ruta med ett långt formulär och nollställde fälten.
 *
 * Två lägen, av samma komponent:
 *
 *   PÅ EN SIDA frågar den när man lämnar: en länk i panelen, och webbläsarens
 *   egen fråga vid omladdning och stängd flik. Next har inget sätt att stoppa
 *   ett sidbyte, så länkklicket fångas innan det når routern.
 *
 *   I EN RUTA (`dialog`) frågar den när Escape trycks. Avbryt är ett val man
 *   gjort med flit och frågar ingenting.
 *
 * `saved` är det senaste svaret från åtgärden. När det ändras är det sparade det
 * som står i fälten. Ett svar med ett fel räknas inte.
 */
export default function UnsavedGuard({
  form,
  dialog,
  saved,
}: {
  form: RefObject<HTMLFormElement | null>;
  /** Rutan formuläret ligger i. Utelämnad betyder en sida. */
  dialog?: RefObject<HTMLDialogElement | null>;
  saved?: unknown;
}) {
  const router = useRouter();
  const dirty = useRef(false);

  /** Adressen man var på väg till, eller "stäng" för rutan. */
  const [asking, setAsking] = useState<string | null>(null);

  useEffect(() => {
    if (saved) dirty.current = false;
  }, [saved]);

  useEffect(() => {
    const element = form.current;
    if (!element) return;

    const touch = () => {
      dirty.current = true;
    };
    const clean = () => {
      dirty.current = false;
    };
    // Knappar som lägger till en rad ändrar formuläret utan något fält.
    const click = (event: MouseEvent) => {
      if ((event.target as Element).closest('button[type="button"]')) touch();
    };

    element.addEventListener("input", touch);
    element.addEventListener("change", touch);
    element.addEventListener("click", click);
    element.addEventListener("reset", clean);

    return () => {
      element.removeEventListener("input", touch);
      element.removeEventListener("change", touch);
      element.removeEventListener("click", click);
      element.removeEventListener("reset", clean);
    };
  }, [form]);

  useEffect(() => {
    const element = dialog?.current;
    if (!element) return;

    const cancel = (event: Event) => {
      if (!dirty.current) return;

      event.preventDefault();
      setAsking("stäng");
    };

    element.addEventListener("cancel", cancel);
    return () => element.removeEventListener("cancel", cancel);
  }, [dialog]);

  useEffect(() => {
    if (dialog) return;

    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };

    const link = (event: MouseEvent) => {
      if (!dirty.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;

      const anchor = (event.target as Element).closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.origin !== location.origin) return;

      event.preventDefault();
      event.stopPropagation();
      setAsking(anchor.href);
    };

    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", link, true);

    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", link, true);
    };
  }, [dialog]);

  if (!asking) return null;

  const closing = asking === "stäng";

  return (
    <AskDialog
      open
      title={closing ? "Stäng utan att spara?" : "Lämna sidan utan att spara?"}
      confirmLabel={closing ? "Stäng rutan" : "Lämna sidan"}
      cancelLabel="Stanna kvar"
      confirmTone="danger"
      onConfirm={() => {
        dirty.current = false;
        setAsking(null);

        if (closing) dialog?.current?.close();
        else router.push(asking);
      }}
      onClose={() => setAsking(null)}
    >
      Ändringarna sparas inte.
    </AskDialog>
  );
}
