import Link from "next/link";

/**
 * EN VECKA BAKÅT, EN FRAMÅT, OCH VECKONUMRET EMELLAN.
 *
 * Samma reglage på varje sida som räknar i veckor. Låg först bara på
 * tidrapporten, medan veckovyn hade tre textknappar ("Föregående", "Denna
 * vecka", "Nästa") och veckonumret på ett helt annat ställe på sidan. Två
 * sätt att göra samma sak betyder att man får lära sig båda.
 *
 * Numret står i mitten och inte som en rubrik någon annanstans: det är det
 * man läser för att veta var man är, och det hör ihop med pilarna som flyttar
 * en därifrån.
 */
export default function WeekStepper({
  backHref,
  forwardHref,
  label,
}: {
  backHref: string;
  forwardHref: string;
  /** "Vecka 41", eller "Vecka 41–43" när perioden spänner över flera. */
  label: string;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md bg-white ring-1 ring-inset ring-neutral-300">
      <StepLink href={backHref} direction="back" label="Föregående vecka" />

      <span className="flex flex-1 items-center justify-center whitespace-nowrap px-3 text-[13px] font-medium text-neutral-900">
        {label}
      </span>

      <StepLink href={forwardHref} direction="forward" label="Nästa vecka" />
    </div>
  );
}

/** En pil i stegaren. */
function StepLink({
  href,
  direction,
  label,
}: {
  href: string;
  direction: "back" | "forward";
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex items-center px-2.5 py-1.5 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
    >
      <svg
        viewBox="0 0 20 20"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {direction === "back" ? (
          <path d="M12 4 6 10l6 6" />
        ) : (
          <path d="m8 4 6 6-6 6" />
        )}
      </svg>
    </Link>
  );
}
