"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * HÄMTAR OM SIDAN MED JÄMNA MELLANRUM (2026-10-20).
 *
 * Översikten visar vem som står instämplad, och en översikt som stått öppen
 * sedan morgonen visade morgonens läge. `router.refresh()` hämtar om sidans
 * data utan att ladda om den: det som visas står kvar tills det nya kommit,
 * utan skelett och utan blink, och ett tal som ändrats lyser upp.
 *
 * Bara när fliken syns. En flik i bakgrunden frågar inte databasen varje
 * minut för en skärm ingen tittar på, och när den tas fram hämtas läget
 * direkt i stället för att vänta ut minuten.
 */
export default function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      stop();
      timer = setInterval(() => router.refresh(), seconds * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, seconds]);

  return null;
}
