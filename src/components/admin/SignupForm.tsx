"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { register, type SignupState } from "@/app/registrera/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * REGISTRERINGEN I TVÅ STEG (ändrat 2026-10-11, issue #16).
 *
 * Var sex fält under varandra. På en telefon betydde det att den som skulle
 * skapa en arbetsyta mötte ett formulär som fortsatte nedanför skärmkanten,
 * och ett formulär man inte ser slutet på ser ut att ta längre tid än det gör.
 *
 * Nu: steg 1 är personen, steg 2 är arbetsytan. Fyra fält och tre.
 *
 * ETT ENDA FORMULÄR, OCH DET ÄR HELA KONSTRUKTIONEN. Båda stegens fält ligger
 * kvar i DOM:en hela tiden; steget styr bara vilket som syns. Två formulär
 * efter varandra hade krävt att steg 1 lagrades någonstans mellan dem, och det
 * någonstans är antingen en server som får halva uppgifter eller en lagring i
 * webbläsaren med personuppgifter i. Här står uppgifterna på ett ställe, i
 * formuläret, till dess att de skickas en gång.
 *
 * `required` SITTER BARA PÅ DET SYNLIGA STEGET. Ett tomt `required`-fält som
 * är gömt gör formuläret ogiltigt, och webbläsaren vägrar då skicka det utan
 * att kunna peka på vilket fält som brast. Steg 1 kontrolleras i stället när
 * man trycker Fortsätt, med webbläsarens egen kontroll, och servern
 * kontrollerar allt igen oavsett vad som stod i formuläret.
 *
 * FÄLTEN FÅR SINA VÄRDEN TILLBAKA EFTER ETT FEL. React nollställer ett
 * formulär som skickats med `action` när åtgärden är klar, och utan ekot i
 * `state.values` vore ett felstavat telefonnummer detsamma som att skriva om
 * allting. Lösenorden ekas inte, se SignupValues.
 *
 * UTAN JAVASCRIPT FINNS INGA STEG, och ingenting går förlorat. Stilen i
 * `noscript` nedan visar båda stegen och gömmer stegmätaren och de knappar som
 * bara flyttar mellan dem. Kvar står ett formulär med sex fält och en knapp,
 * alltså precis det som fanns före den här ändringen. Samma hållning som
 * pointerparallaxen på säljsidan har, se `Parallax.tsx`.
 */

type Step = 1 | 2;

const STEPS: Record<Step, string> = {
  1: "Om dig",
  2: "Arbetsytan",
};

export default function SignupForm() {
  const [state, action] = useActionState<SignupState, FormData>(register, {});
  const [step, setStep] = useState<Step>(1);

  // Tomt vid första visningen, ifyllt efter ett fel. Se SignupState.
  const was = state.values;

  const panes = useRef<Record<Step, HTMLFieldSetElement | null>>({
    1: null,
    2: null,
  });

  /**
   * Sätts när ANVÄNDAREN byter steg, och inte när ett serverfel gör det.
   *
   * Den som trycker Fortsätt ska få markören i nästa fält. Den som fått ett
   * besked om sin e-postadress ska få läsa beskedet, inte se markören hoppa
   * till ett fält i samma stund.
   */
  const focusNext = useRef(false);

  // Felet kan höra till ett fält på det andra steget. Se SignupState.
  useEffect(() => {
    if (state.step) setStep(state.step);
  }, [state]);

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    panes.current[step]?.querySelector("input")?.focus();
  }, [step]);

  function goTo(next: Step) {
    focusNext.current = true;
    setStep(next);
  }

  /**
   * Vidare till steg 2, om webbläsaren godkänner fälten på steg 1.
   *
   * `reportValidity` på varje fält i tur och ordning, och inte på formuläret:
   * formuläret innehåller även steg 2, som är tomt vid det här laget.
   */
  function forward() {
    const pane = panes.current[1];
    if (!pane) return;

    for (const field of pane.querySelectorAll("input")) {
      if (!field.reportValidity()) return;
    }

    goTo(2);
  }

  return (
    <form action={action} className="space-y-5">
      <noscript>
        <style>
          {'[data-signup-pane],[data-signup-nav="2"]{display:revert!important}' +
            '[data-signup-steps],[data-signup-nav="1"],[data-signup-back]{display:none!important}'}
        </style>
      </noscript>

      <Stepper step={step} />

      {state.error && <Alert>{state.error}</Alert>}

      {/* Fälla för skript. Dold för människor och för skärmläsare, och
          utan autoifyllning. Se registrera/actions.ts. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Webbplats
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset
        data-signup-pane=""
        hidden={step !== 1}
        ref={(node) => {
          panes.current[1] = node;
        }}
        className="space-y-4"
      >
        {/* FÖRNAMN OCH EFTERNAMN I VARSITT FÄLT. Ett enda namnfält gav
            förnamnet och ingenting mer, och en arbetsyta med två som heter
            Anna går inte att skilja åt. Se person-name.ts. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Förnamn">
            <Input
              name="firstName"
              autoComplete="given-name"
              autoFocus
              defaultValue={was?.firstName ?? ""}
              required={step === 1}
            />
          </Field>

          <Field label="Efternamn">
            <Input
              name="lastName"
              autoComplete="family-name"
              defaultValue={was?.lastName ?? ""}
              required={step === 1}
            />
          </Field>
        </div>

        <Field label="E-postadress" hint="Används för inloggning">
          <Input
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={was?.email ?? ""}
            required={step === 1}
          />
        </Field>

        <Field label="Telefonnummer" hint="T.ex. 070-123 45 67">
          <Input
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={was?.phone ?? ""}
            required={step === 1}
          />
        </Field>
      </fieldset>

      <fieldset
        data-signup-pane=""
        hidden={step !== 2}
        ref={(node) => {
          panes.current[2] = node;
        }}
        className="space-y-4"
      >
        <Field label="Företagets namn">
          <Input
            name="companyName"
            placeholder="Mekaniska AB"
            defaultValue={was?.companyName ?? ""}
            required={step === 2}
          />
        </Field>

        <Field label="Lösenord" hint="Minst 10 tecken">
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required={step === 2}
          />
        </Field>

        <Field label="Upprepa lösenordet">
          <Input
            name="repeat"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required={step === 2}
          />
        </Field>
      </fieldset>

      <div data-signup-nav="1" hidden={step !== 1}>
        <Button type="button" onClick={forward} className="w-full">
          Fortsätt
        </Button>
      </div>

      <div data-signup-nav="2" hidden={step !== 2} className="flex gap-3">
        <BackButton onClick={() => goTo(1)} />
        <SubmitButton />
      </div>
    </form>
  );
}

/**
 * STEGMÄTAREN.
 *
 * Två band och två namn. Bandet före det man står på ligger kvar ifyllt, så
 * att mätaren svarar på både var man är och hur mycket som återstår.
 *
 * Fjord och inte grönt. Grönt betyder "pågår just nu" i hela produkten, och en
 * mätare som växer är inte ett pågående arbete utan en väg man gått.
 */
function Stepper({ step }: { step: Step }) {
  return (
    <ol data-signup-steps="" className="grid grid-cols-2 gap-2">
      {([1, 2] as const).map((number) => {
        const here = number === step;
        const passed = number <= step;

        return (
          <li key={number} aria-current={here ? "step" : undefined}>
            <span
              className={`block h-[3px] rounded-full transition-colors duration-500 ${
                passed ? "bg-blue-600" : "bg-neutral-200"
              }`}
            />
            <span
              className={`mt-2 block text-[11px] font-medium uppercase tracking-wider transition-colors ${
                here ? "text-neutral-700" : "text-neutral-400"
              }`}
            >
              {STEPS[number]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Tillbaka till steg 1.
 *
 * Avstängd medan arbetsytan skapas. Går man tillbaka mitt i skickandet står
 * man på ett formulär som ser ifyllbart ut medan servern redan hashar
 * lösenordet.
 */
function BackButton({ onClick }: { onClick: () => void }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="button"
      tone="secondary"
      onClick={onClick}
      disabled={pending}
      data-signup-back=""
    >
      Tillbaka
    </Button>
  );
}

function SubmitButton() {
  // Lösenordshashningen tar en dryg sekund med flit. Utan besked ser sidan
  // död ut under tiden, och folk trycker igen.
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="flex-1">
      {pending ? "Skapar arbetsyta…" : "Skapa arbetsyta"}
    </Button>
  );
}
