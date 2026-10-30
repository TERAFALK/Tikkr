"use client";

import {
  useEffect,
  useId,
  useTransition,
  type FormEvent,
  type RefObject,
} from "react";

/**
 * SKICKAR ETT FORMULÄR UTAN ATT TÖMMA DET.
 *
 * React nollställer ett formulär som skickats med `action`, också när åtgärden
 * svarat med ett fel. Rutan stod då kvar med sitt felmeddelande, men allt man
 * skrivit var borta, och ett upptaget anställningsnummer betydde att skriva om
 * hela formuläret.
 *
 * Skickat med `onSubmit` står fälten kvar. Rutan stänger sig och nollställer
 * sig själv när åtgärden gått igenom. `pending` ersätter `useFormStatus`, som
 * bara känner till `action`.
 */
export function useKeptSubmit(submit: (data: FormData) => void) {
  const [pending, start] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    start(() => submit(data));
  }

  return { pending, onSubmit };
}

/**
 * PEKAR UT FÄLTET SOM BRAST.
 *
 * Ett felsvar stod bara som en ruta överst i formuläret, och i ett långt
 * formulär fick man själv leta efter vilket fält det gällde. Skärmläsare fick
 * inte heller veta något.
 *
 * Åtgärden svarar med fältets namn (`field`), och här märks fältet och får
 * fokus. Märkningen sätts på elementet och inte som en prop, så att varje
 * formulär får det utan att varje fält behöver veta något om felet. Utseendet
 * står i designsystemets `aria-[invalid=true]`.
 *
 * Svarar åtgärden utan fält står felet kvar i rutan, som förut. Det gäller fel
 * som inte hör till ett enda fält.
 *
 * Ger tillbaka id:t för rutan med felet, som fältet pekar på.
 */
export function useFieldError(
  form: RefObject<HTMLFormElement | null>,
  state: { error?: string; field?: string }
): string {
  const errorId = useId();

  useEffect(() => {
    const element = form.current;
    if (!element) return;

    element.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
      field.removeAttribute("aria-invalid");
      field.removeAttribute("aria-describedby");
    });

    if (!state.error || !state.field) return;

    const target = element.elements.namedItem(state.field);
    if (!(target instanceof HTMLElement)) return;

    target.setAttribute("aria-invalid", "true");
    target.setAttribute("aria-describedby", errorId);
    target.focus();
  }, [form, state, errorId]);

  return errorId;
}
