"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { pairDevice, type PairingState } from "@/app/kiosk/actions";
import { LogoMark } from "@/components/ui/Logo";

/**
 * KODFÄLTET SOM KOPPLAR SKÄRMEN.
 *
 * Sex separata rutor i stället för ett långt fält. Två skäl: siffrorna går att
 * läsa upp i par från andra sidan rummet utan att tappa räkningen, och den som
 * knappar in dem ser direkt hur många som är kvar.
 *
 * Fokus flyttas framåt av sig självt och koden skickas när sista siffran är
 * ifylld — ett extra tryck efter att koden redan är komplett är ett steg utan
 * syfte. Knappen finns ändå kvar: den som råkat backa ett steg, eller vars
 * surfplatta beter sig oväntat, ska aldrig stå framför en skärm utan något att
 * trycka på.
 *
 * Varje ruta tar EN siffra. Inklistring hanteras separat, eftersom en ruta som
 * tar emot flera tecken annars sväljer hela koden när någon skriver över en
 * siffra som redan står där.
 */

const LENGTH = 6;

export default function PairingForm() {
  const [state, submit] = useActionState<PairingState, FormData>(pairDevice, {});

  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const form = useRef<HTMLFormElement>(null);

  /** Senast skickade kod, så att en komplett kod inte skickas om och om igen. */
  const sent = useRef("");

  const code = digits.join("");
  const complete = code.length === LENGTH;

  // Skickar av sig själv när sista siffran är på plats. Ligger i en effekt och
  // inte i tangenttryckningen: det värde som ska skickas måste ha hunnit
  // renderas till det dolda fältet först.
  useEffect(() => {
    if (code.length !== LENGTH) return;
    if (sent.current === code) return;

    sent.current = code;
    form.current?.requestSubmit();
  }, [code]);

  // Tömmer rutorna när servern svarat nej, så att nästa försök börjar från
  // början. Beroendet är hela svaret och inte feltexten — samma fel två gånger
  // i rad ska rensa båda gångerna.
  useEffect(() => {
    if (!state.error) return;

    setDigits(Array(LENGTH).fill(""));
    sent.current = "";
    inputs.current[0]?.focus();
  }, [state]);

  /** Skriver en siffra i en ruta och flyttar fokus framåt. */
  function place(index: number, value: string) {
    // Sista tecknet, inte det första: skriver någon över en ruta som redan har
    // en siffra är det den nya siffran som avses.
    const digit = value.replace(/\D/g, "").slice(-1);
    if (!digit) return;

    setDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });

    inputs.current[Math.min(index + 1, LENGTH - 1)]?.focus();
  }

  /** Fördelar en inklistrad kod över rutorna. */
  function paste(index: number, text: string) {
    const clean = text.replace(/\D/g, "");
    if (!clean) return;

    setDigits((current) => {
      const next = [...current];

      for (let i = 0; i < clean.length && index + i < LENGTH; i += 1) {
        next[index + i] = clean[i];
      }

      return next;
    });

    inputs.current[Math.min(index + clean.length, LENGTH - 1)]?.focus();
  }

  /** Backsteg tömmer rutan, eller hoppar bakåt när den redan är tom. */
  function back(index: number, key: string) {
    if (key !== "Backspace") return;

    setDigits((current) => {
      const next = [...current];

      if (next[index]) {
        next[index] = "";
      } else if (index > 0) {
        next[index - 1] = "";
        inputs.current[index - 1]?.focus();
      }

      return next;
    });
  }

  if (state.pairedAs) {
    return (
      <Frame>
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-emerald-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 13 4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl font-semibold text-neutral-900">
          Skärmen är kopplad
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Den är upplagd som{" "}
          <strong className="font-semibold text-neutral-900">
            {state.pairedAs}
          </strong>
          .
        </p>

        {/* Full omladdning med flit. Sidan hämtar sitt läge på servern med den
            nya cookien, och en klientnavigering skulle kunna återanvända det
            gamla svaret. */}
        <a
          href="/kiosk"
          className="kiosk-press mt-8 inline-block rounded-xl bg-blue-600 px-10 py-5 text-xl font-semibold text-white active:bg-blue-700"
        >
          Börja stämpla
        </a>
      </Frame>
    );
  }

  return (
    <Frame>
      <h1 className="text-3xl font-semibold text-neutral-900">
        Koppla skärmen
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-neutral-600">
        Skriv in koden från adminpanelen, under Stämplingsskärmar.
      </p>

      <form ref={form} action={submit} className="mt-8">
        <input type="hidden" name="code" value={code} />

        <div className="flex justify-center gap-2 sm:gap-3">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputs.current[index] = element;
              }}
              // Siffertangentbord på surfplatta. type="number" ger pilar och
              // tillåter minustecken, vilket inte hör hemma i en kod.
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={digit}
              aria-label={`Siffra ${index + 1}`}
              autoFocus={index === 0}
              onChange={(event) => place(index, event.target.value)}
              onKeyDown={(event) => back(index, event.key)}
              onPaste={(event) => {
                event.preventDefault();
                paste(index, event.clipboardData.getData("text"));
              }}
              onFocus={(event) => event.target.select()}
              className="h-20 w-14 rounded-xl border-2 border-neutral-200 bg-white text-center text-3xl font-semibold text-neutral-900 focus:border-blue-600 focus:outline-none sm:h-24 sm:w-16 sm:text-4xl"
            />
          ))}
        </div>

        {state.error && (
          <p className="mt-6 rounded-lg bg-amber-50 px-5 py-3 text-base font-medium text-amber-800">
            {state.error}
          </p>
        )}

        <Submit complete={complete} />
      </form>

      <p className="mt-10 text-sm text-neutral-400">
        Koden gäller i fem minuter och kan bara användas en gång.
      </p>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="kiosk-surface flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-8">
      <div className="w-full max-w-lg text-center">
        <LogoMark size={44} />
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

function Submit({ complete }: { complete: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={!complete || pending}
      className="kiosk-press mt-8 w-full rounded-xl bg-blue-600 px-10 py-5 text-xl font-semibold text-white active:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400"
    >
      {pending ? "Kopplar…" : "Koppla skärmen"}
    </button>
  );
}
