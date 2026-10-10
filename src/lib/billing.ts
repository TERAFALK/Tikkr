import type Stripe from "stripe";
import { unsafeGlobalPrisma } from "./db";
import {
  agreedPrices,
  discountFrom,
  hasAgreement,
  priceFor,
  type AgreedPrices,
} from "./company-prices";
import { getLicenseState, setLicenseCount } from "./licenses";
import { enabledModules } from "./company-modules";
import { MODULES, MODULE_KEYS, type ModuleKey } from "./modules";
import { priceBook, SCREEN_ITEM, type PriceBook } from "./price-book";
import {
  getModulePricing,
  getScreenPricing,
  moduleItemsOf,
  modulePriceId,
  screenItemOf,
  screenPriceId,
  stripe,
  type BillingInterval,
  type ModulePricing,
  type ScreenPricing,
} from "./stripe";

/**
 * PRENUMERATIONEN.
 *
 * Priset sätts på artikeln hos Stripe och läses därifrån, se getScreenPricing
 * i stripe.ts. Det gäller per stämplingsskärm och månad. Antalet skärmar är
 * alltså kvantiteten på prenumerationen, och den måste hållas i takt med
 * verkligheten — annars fakturerar vi för skärmar som återkallats, eller
 * missar att ta betalt för nya.
 */

/**
 * Ett svar kunden ska se, till skillnad från ett driftfel.
 *
 * Kastas när ändringen inte går att göra av ett skäl som går att rätta: redan
 * påslaget, ett antal som inte får debiteras, en artikel som saknas. Allt
 * annat hamnar i serverloggen och möts av ett allmänt meddelande.
 */
export class BillingChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingChangeError";
  }
}

/**
 * Startar kassan där kunden fyller i sitt kort.
 *
 * Vi skapar aldrig prenumerationen själva. Stripe gör det när betalningen
 * gått igenom och berättar för oss via webhooken — det är den enda ordning
 * där vi inte riskerar att ha en prenumeration i vår databas som inte finns
 * hos dem, eller tvärtom.
 */
export async function createCheckoutSession(params: {
  companyId: string;
  companyName: string;
  email: string;
  baseUrl: string;
  interval: BillingInterval;
  screens: number;
}): Promise<string> {
  const screens = Math.max(1, Math.min(100, Math.floor(params.screens)));

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: params.companyId },
    select: { stripeCustomerId: true },
  });

  // Tillvalen kunden slagit på under provperioden följer med in i kassan.
  // Reglaget är samma knapp hela vägen: gratis under provperioden, en rad på
  // fakturan efteråt. Kunden ser båda raderna hos Stripe innan de betalar.
  //
  // Kvantitet 1 och ingen justering: tillvalen är fasta belopp per företag.
  const book = await priceBook();
  const modules = await enabledModules(params.companyId);

  // SAKNAS ARTIKELN FÖR DET VALDA INTERVALLET VÄGRAR VI, i stället för att
  // hoppa över raden.
  //
  // Att bara filtrera bort den var det första försöket, och det var tyst på
  // värsta sättet: kunden betalade för skärmarna, webhooken såg ingen
  // modulrad hos Stripe och städade därför bort tillvalet — som alltså
  // försvann i samma ögonblick som de började betala för det.
  //
  // En prenumerations alla rader MÅSTE dela intervall hos Stripe, så det går
  // inte att lösa genom att lägga modulen på månad bredvid ett årsabonnemang.
  const missing = modules.filter(
    (key) => !modulePriceId(book, key, params.interval)
  );

  if (missing.length > 0) {
    const names = missing.map((key) => MODULES[key].name).join(", ");

    throw new BillingChangeError(
      params.interval === "year"
        ? `${names} går inte att köpa med årsbetalning. Välj månadsbetalning, eller stäng av tillvalet först.`
        : `${names} går inte att köpa just nu. Stäng av tillvalet, eller kontakta support@tikkr.se.`
    );
  }

  const moduleLines = modules
    .map((key) => modulePriceId(book, key, params.interval))
    .filter((price): price is string => Boolean(price))
    .map((price) => ({ price, quantity: 1 }));

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        price: screenPriceId(book, params.interval),
        quantity: screens,
        // Kunden kan justera antalet i kassan också. Den som ändrar sig i
        // sista stund ska inte behöva backa ut och börja om.
        adjustable_quantity: { enabled: true, minimum: 1, maximum: 100 },
      },
      ...moduleLines,
    ],

    // Finns kunden redan hos Stripe återanvänder vi den, så att en kund som
    // avslutat och kommer tillbaka inte blir två kunder med varsin historik.
    ...(company?.stripeCustomerId
      ? { customer: company.stripeCustomerId }
      : { customer_email: params.email }),

    // Följer med tillbaka i webhooken. Utan den vet vi inte vilket företag
    // betalningen gällde.
    client_reference_id: params.companyId,
    subscription_data: {
      metadata: { companyId: params.companyId },
    },
    metadata: { companyId: params.companyId },

    // Kunden kan ändra antalet skärmar i kassan. Att låsa det vore
    // förvirrande — de vet bäst hur många de behöver.
    allow_promotion_codes: true,

    success_url: `${params.baseUrl}/admin/installningar/prenumeration?klart=1`,
    cancel_url: `${params.baseUrl}/admin/installningar/prenumeration`,
  });

  if (!session.url) {
    throw new Error("Stripe returnerade ingen kassaadress.");
  }

  return session.url;
}

/**
 * Öppnar Stripes egen sida där kunden byter kort, ser fakturor och säger upp.
 *
 * Att bygga det själv hade betytt att vi hanterar kortuppgifter, kvitton och
 * uppsägningsflöden — allt sådant som Stripe redan gör och som vi bara skulle
 * göra sämre.
 */
export async function createPortalSession(params: {
  companyId: string;
  baseUrl: string;
}): Promise<string> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: params.companyId },
    select: { stripeCustomerId: true },
  });

  if (!company?.stripeCustomerId) {
    throw new Error("Företaget har ännu ingen prenumeration hos Stripe.");
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: `${params.baseUrl}/admin/installningar/prenumeration`,
  });

  return session.url;
}

/**
 * SKRIVER OM MODULRADERNA EFTER VAD STRIPE SÄGER.
 *
 * När ett företag har en prenumeration är dess rader HELA sanningen om vilka
 * tillval de har. Modul på prenumerationen men inte hos oss läggs till; modul
 * hos oss men inte på prenumerationen tas bort.
 *
 * Regeln är avsiktligt total och inte "rör bara det Stripe satt". Skälet:
 * plattformspanelen vägrar redan ändra tillval för ett företag med
 * prenumeration, så det finns ingen modul vi gett bort vid sidan av fakturan
 * som skulle kunna städas bort av misstag. En enklare regel med färre lägen
 * slår en klok regel med flera.
 *
 * Kör vid varje besked från Stripe OCH vid varje visning av
 * prenumerationssidan, av samma skäl som licensantalet läks där: ett missat
 * besked ska inte kräva att kunden hör av sig.
 */
export async function syncModulesFromSubscription(
  companyId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const onStripe = moduleItemsOf(await priceBook(), subscription);
  const wanted = new Map(onStripe.map((item) => [item.key, item.itemId]));

  const current = await unsafeGlobalPrisma.companyModule.findMany({
    where: { companyId },
    select: { module: true, source: true, stripeItemId: true },
  });

  const toRemove = current
    .filter((row) => !wanted.has(row.module))
    .map((row) => row.module);

  if (toRemove.length > 0) {
    await unsafeGlobalPrisma.companyModule.deleteMany({
      where: { companyId, module: { in: toRemove } },
    });
  }

  for (const [key, itemId] of wanted) {
    const row = current.find((item) => item.module === key);

    // SKRIVER BARA NÄR NÅGOT SKILJER SIG. Funktionen körs vid varje visning
    // av prenumerationssidan, och en upsert som varje gång skriver samma
    // värden hade flyttat updated_at utan att något hänt — vilket gör fältet
    // oanvändbart för att se när kunden faktiskt köpte modulen.
    if (row?.source === "STRIPE" && row.stripeItemId === itemId) continue;

    await unsafeGlobalPrisma.companyModule.upsert({
      where: { companyId_module: { companyId, module: key } },
      create: {
        companyId,
        module: key,
        source: "STRIPE",
        stripeItemId: itemId,
      },
      // En rad som slogs på för hand under provperioden blir Stripe-styrd i
      // samma stund som den hamnar på en faktura. Annars hade
      // plattformspanelen trott att den fortfarande gick att ändra där.
      update: { source: "STRIPE", stripeItemId: itemId },
    });
  }
}

/** Ett tillval så som prenumerationssidan visar det. */
export interface ModuleOffer {
  key: ModuleKey;
  name: string;
  summary: string;
  enabled: boolean;
  /** Priset kunden betalar, avtalat eller enligt listan. */
  amount: number;
  /** Listpriset i samma intervall. Skiljer sig bara vid ett avtalat pris. */
  listAmount: number;
  /** false när artikeln saknas för det intervall kunden betalar i. */
  forSale: boolean;
  /** Vilka intervall modulen alls går att köpa i. Styr vad UI:t kan säga. */
  soldMonthly: boolean;
  soldYearly: boolean;
}

export interface BillingOverview {
  /** Antal licenser, alltså vad kunden betalar för. */
  screens: number;
  /** Antal aktiva skärmar av dessa. */
  used: number;
  monthlyAmount: number;
  yearlyAmount: number | null;
  /** Vad kunden sparar på att betala ett år i förskott. */
  yearlySaving: number | null;
  hasSubscription: boolean;
  /**
   * SKÖTS AV OSS, INTE AV KUNDEN.
   *
   * Sant för ett företag som är ACTIVE eller PAST_DUE utan prenumeration hos
   * Stripe. Det läget uppstår bara på ett sätt: någon har satt det för hand i
   * plattformspanelen — en kund som betalar mot faktura, en vi bjuder på
   * systemet, eller en som väntar på att kortbetalningen ska kopplas på.
   *
   * För dem ska panelen VISA vad som gäller men inte kunna ändra det. Två
   * saker skulle annars gå fel, och båda kostar pengar:
   *
   *   Ett köp i kassan skulle lägga en kortprenumeration OVANPÅ den faktura
   *   vi redan skickar, och kunden betalar dubbelt utan att något i systemet
   *   säger ifrån.
   *
   *   Ett tillval som slås på utan prenumeration är gratis — reglaget skriver
   *   bara en rad i company_modules. En fakturakund hade därmed kunnat ta
   *   planeringen för 699 kr i månaden utan att någonstans bli debiterad.
   *
   * TRIALING räknas INTE hit. Provperioden ska vara fri att pröva i, och det
   * är hela poängen med den (CLAUDE.md § 8). CANCELED räknas inte heller:
   * den som vill komma tillbaka ska kunna köpa igen utan att höra av sig.
   */
  platformManaged: boolean;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  interval: BillingInterval | null;
  /** Priset per skärm, hämtat från artikeln hos betaltjänsten. */
  pricing: ScreenPricing;
  /** Tillvalen, med läge och pris i kundens intervall. */
  modules: ModuleOffer[];
  /** Summan av de påslagna tillvalen, i kundens intervall. */
  moduleAmount: number;
  /**
   * Påslagna tillval som saknar årsartikel, med namn.
   *
   * Tom lista betyder att årsbetalning går att välja i kassan. Är den inte
   * tom skulle kassan vägra, och då ska knappen inte finnas — ett val som
   * alltid ger ett felmeddelande är inget val.
   */
  blocksYearly: string[];
  /**
   * AVTALAT PRIS, när vi kommit överens om något annat än listpriset.
   *
   * Null för den stora merparten av kunderna, som betalar vad som står på
   * säljsidan. Finns den visar prenumerationssidan listpriset överstruket
   * bredvid det avtalade, med rabatten i procent — kunden ska förstå vad hen
   * fått, inte bara se ett tal som avviker från säljsidan.
   *
   * Gäller bara företag utan prenumeration hos Stripe. Se company-prices.ts.
   */
  agreement: Agreement | null;
}

export interface Agreement {
  /** Hela månadsbeloppet till listpris, skärmar och tillval. */
  listTotal: number;
  /** Hela månadsbeloppet enligt överenskommelsen. */
  total: number;
  /** Rabatten på totalen i procent. Null när det inte är en rabatt. */
  discountPercent: number | null;
  /** Listpriset per skärm och månad. */
  listPerScreen: number;
  /** Det avtalade priset per skärm och månad. */
  perScreen: number;
}

/**
 * Tillvalen som rader att visa.
 *
 * Saknas artikeln hos Stripe för det intervall kunden betalar i går modulen
 * inte att köpa. Den visas ändå, men utan knapp — en modul som tyst försvinner
 * ur listan ser ut som att den inte finns, och då hör ingen av sig om att den
 * borde gå att köpa.
 */
function moduleOffers(
  book: PriceBook,
  pricing: ModulePricing,
  enabled: ModuleKey[],
  interval: BillingInterval,
  /** Avtalade priser. Tomt betyder listpris. */
  agreed: AgreedPrices = {}
): ModuleOffer[] {
  return MODULE_KEYS.map((key) => {
    const price = pricing[key];

    return {
      key,
      name: MODULES[key].name,
      summary: MODULES[key].summary,
      enabled: enabled.includes(key),
      amount: priceFor(
        agreed,
        key,
        interval === "year" ? (price.year ?? price.month * 12) : price.month
      ),
      listAmount:
        interval === "year" ? (price.year ?? price.month * 12) : price.month,
      forSale: Boolean(modulePriceId(book, key, interval)),
      soldMonthly: Boolean(modulePriceId(book, key, "month")),
      soldYearly: Boolean(modulePriceId(book, key, "year")),
    };
  });
}

/** Vad kunden ser på prenumerationssidan. */
/**
 * Sköts företaget av oss i stället för av kunden?
 *
 * Ligger som en egen funktion så att både översikten och serveråtgärderna
 * svarar på frågan likadant. Åtgärderna måste fråga själva — att dölja en
 * knapp är kosmetik, och ett formulär kan skickas av annat än sidan. Samma
 * hållning som modulgrinden i company-modules.ts.
 */
export function isPlatformManaged(
  stripeSubscriptionId: string | null,
  status: string
): boolean {
  if (stripeSubscriptionId) return false;
  return status === "ACTIVE" || status === "PAST_DUE";
}

/** Läser läget ur databasen. För serveråtgärderna, som bara har ett id. */
export async function platformManagedCompany(
  companyId: string
): Promise<boolean> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { stripeSubscriptionId: true, subscriptionStatus: true },
  });

  if (!company) return false;

  return isPlatformManaged(
    company.stripeSubscriptionId,
    company.subscriptionStatus
  );
}

export async function getBillingOverview(
  companyId: string
): Promise<BillingOverview> {
  const [licenses, pricing, modulePricing, book, deal] = await Promise.all([
    getLicenseState(companyId),
    getScreenPricing(),
    getModulePricing(),
    priceBook(),
    agreedPrices(companyId),
  ]);

  const screens = licenses.total;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { stripeSubscriptionId: true, subscriptionStatus: true },
  });

  // ETT AVTALAT PRIS GÄLLER BARA DEN VI FAKTURERAR SJÄLVA. Har kunden ett
  // kort hos Stripe är det kortet som dras, och att visa ett annat tal vore
  // en lögn. Raden kan ligga kvar från tiden före prenumerationen.
  const agreed: AgreedPrices = company?.stripeSubscriptionId ? {} : deal;

  const perScreen = priceFor(agreed, SCREEN_ITEM, pricing.month);

  const amounts = (count: number) => ({
    monthlyAmount: count * perScreen,
    // ÅRSBELOPPEN FALLER BORT VID ETT AVTALAT PRIS. Överenskommelsen är ett
    // månadspris, och ett årsbelopp räknat på listpriset bredvid det hade
    // varit ett tal kunden inte kan betala.
    yearlyAmount:
      pricing.year === null || hasAgreement(agreed) ? null : count * pricing.year,
    yearlySaving:
      pricing.year === null || hasAgreement(agreed)
        ? null
        : count * (pricing.month * 12 - pricing.year),
  });

  const overview: BillingOverview = {
    screens,
    used: licenses.used,
    ...amounts(screens),
    hasSubscription: Boolean(company?.stripeSubscriptionId),
    platformManaged: isPlatformManaged(
      company?.stripeSubscriptionId ?? null,
      company?.subscriptionStatus ?? "TRIALING"
    ),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    interval: null,
    pricing,
    modules: [],
    moduleAmount: 0,
    blocksYearly: [],
    agreement: null,
  };

  // Tillvalen räknas fram sist, när intervallet är känt. Utan prenumeration
  // finns inget intervall, och månad är då det pris kunden kommer att möta.
  const describeModules = async (interval: BillingInterval) => {
    const enabled = await enabledModules(companyId);

    overview.modules = moduleOffers(
      book,
      modulePricing,
      enabled,
      interval,
      agreed
    );

    const on = overview.modules.filter((module) => module.enabled);

    overview.moduleAmount = on.reduce((sum, module) => sum + module.amount, 0);
    overview.blocksYearly = on
      .filter((module) => !module.soldYearly)
      .map((module) => module.name);

    // ÖVERENSKOMMELSEN SAMMANFATTAS när den finns, så att sidan kan visa
    // listpriset överstruket bredvid det avtalade. Räknas här och inte i
    // sidan: rabatten är ett tal som ska stämma med beloppen ovanför, och två
    // räkningar av samma sak hinner alltid sluta säga samma sak.
    if (hasAgreement(agreed)) {
      const listTotal =
        screens * pricing.month +
        on.reduce((sum, module) => sum + module.listAmount, 0);

      const total = screens * perScreen + overview.moduleAmount;

      overview.agreement = {
        listTotal,
        total,
        discountPercent: discountFrom(listTotal, total),
        listPerScreen: pricing.month,
        perScreen,
      };
    }
  };

  if (!company?.stripeSubscriptionId) {
    await describeModules("month");
    return overview;
  }

  try {
    const subscription = await stripe().subscriptions.retrieve(
      company.stripeSubscriptionId
    );

    // Slutdatumet för perioden ligger på olika ställen i olika versioner av
    // Stripes API: på prenumerationen i äldre, på raden i nyare. Vi läser
    // båda och tar det som finns, istället för att låsa oss vid en version
    // som ändras under fötterna på oss.
    const shape = subscription as unknown as {
      current_period_end?: number;
      items?: { data?: Array<{ current_period_end?: number }> };
    };

    const periodEnd =
      shape.current_period_end ?? shape.items?.data?.[0]?.current_period_end;

    overview.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
    overview.cancelAtPeriodEnd = subscription.cancel_at_period_end;

    // SKÄRMRADEN SLÅS UPP PÅ PRIS-ID, inte på plats i listan. Med en modulrad
    // bredvid är ordningen inte längre given, och `items.data[0]` kunde lika
    // gärna vara löneunderlaget — då hade antalet licenser satts till ett.
    const item = screenItemOf(book, subscription);

    overview.interval =
      item?.price?.recurring?.interval === "year" ? "year" : "month";

    // Stämmer av mot Stripe varje gång sidan visas. Normalt har webhooken
    // redan skrivit samma siffra, men den kan vara försenad eller ha missats
    // — och då ska kunden som just godkänt en ändring ändå se rätt antal när
    // de kommer tillbaka hit, utan att behöva höra av sig.
    const quantity = item?.quantity;

    if (quantity && quantity !== screens) {
      await setLicenseCount(companyId, quantity);

      overview.screens = quantity;
      Object.assign(overview, amounts(quantity));
    }

    // Samma självläkning för tillvalen.
    await syncModulesFromSubscription(companyId, subscription);
  } catch (error) {
    // Sidan ska gå att öppna även när Stripe inte svarar.
    console.error("Kunde inte hämta prenumerationen från Stripe", error);
  }

  await describeModules(overview.interval ?? "month");

  return overview;
}

/* -------------------------------------------------------------------------- */
/* Att lägga till eller ta bort ett tillval på en levande prenumeration        */
/* -------------------------------------------------------------------------- */

export interface ModuleChangePreview {
  key: ModuleKey;
  name: string;
  on: boolean;
  interval: BillingInterval;
  /** Den löpande avgiften för modulen efter ändringen. */
  recurringAmount: number;
  /**
   * Vad nästa faktura landar på, inklusive avräkningen för resten av den
   * pågående perioden. null när Stripe inte kunde räkna fram den.
   */
  nextInvoiceAmount: number | null;
  nextInvoiceAt: Date | null;
}

/**
 * Vad ändringen kommer att kosta — räknat av Stripe, inte av oss.
 *
 * Beloppet ska räknas fram av den part som faktiskt debiterar. En siffra vi
 * räknat ut i förväg är en gissning om vad Stripe kommer att fakturera, och
 * en gissning duger inte för något som ändrar en faktura.
 *
 * MISSLYCKAS BERÄKNINGEN STOPPAS INTE KÖPET. Då saknas bara beloppet, och
 * kunden får veta vad modulen kostar löpande i stället. Att vägra sälja för
 * att en förhandsvisning inte gick att hämta vore fel avvägning.
 */
export async function previewModuleChange(params: {
  companyId: string;
  key: ModuleKey;
  on: boolean;
}): Promise<ModuleChangePreview> {
  const { subscription, interval, book } = await subscriptionFor(
    params.companyId
  );

  const pricing = await getModulePricing();
  const price = pricing[params.key];

  const recurringAmount =
    interval === "year" ? (price.year ?? price.month * 12) : price.month;

  const preview: ModuleChangePreview = {
    key: params.key,
    name: MODULES[params.key].name,
    on: params.on,
    interval,
    recurringAmount,
    nextInvoiceAmount: null,
    nextInvoiceAt: null,
  };

  // LIGGER UTANFÖR try-BLOCKET. Den här kastar ModuleChangeError när modulen
  // redan är påslagen eller när artikeln saknas, och det är svar kunden ska
  // se. Låg anropet innanför hade catch:en nedan svalt dem och visat en
  // bekräftelseruta för en ändring som inte går att göra.
  const items = changedItems(
    book,
    subscription,
    params.key,
    params.on,
    interval
  );

  const upcoming = await upcomingAfter(subscription, items, "tillval");

  preview.nextInvoiceAmount = upcoming.amount;
  preview.nextInvoiceAt = upcoming.at;

  return preview;
}

/**
 * Vad nästa faktura landar på om raderna ändras så här.
 *
 * Delas av licensändringen och tillvalen. Svarar med tomma värden när Stripe
 * inte kunde räkna — se previewInvoice nedan om varför det aldrig stoppar en
 * ändring.
 */
async function upcomingAfter(
  subscription: Stripe.Subscription,
  items: ItemChange[],
  what: string
): Promise<{ amount: number | null; at: Date | null }> {
  try {
    const upcoming = await previewInvoice({
      customer: subscriptionCustomerId(subscription),
      subscription: subscription.id,
      subscription_details: {
        items,

        // En ändring mitt i perioden kostar resterande dagar, varken en hel
        // period eller noll.
        proration_behavior: "create_prorations",
      },
    });

    if (!upcoming) return { amount: null, at: null };

    // Fältet heter olika i olika versioner av Stripes API, precis som
    // periodslutet i getBillingOverview. Vi läser båda och tar det som finns.
    const at = upcoming.next_payment_attempt ?? upcoming.period_end;

    return {
      amount: upcoming.amount_due / 100,
      at: at ? new Date(at * 1000) : null,
    };
  } catch (error) {
    console.error(
      `[${what}] Kunde inte hämta förhandsberäkningen från Stripe:`,
      error instanceof Error ? error.message : error
    );

    return { amount: null, at: null };
  }
}

/**
 * Den kommande fakturan som Stripe räknar fram, eller null.
 *
 * ANROPET GÖRS OTYPAT MED FLIT, och det är värt att förklara eftersom det
 * bryter mot hur resten av filen pratar med Stripe.
 *
 * Metoden bytte namn mellan versioner av deras bibliotek:
 * `invoices.retrieveUpcoming` i version 17, `invoices.createPreview` i 18.
 * Skrevs anropet typat mot den ena skulle en framtida versionshöjning stanna
 * bygget — och det som då går sönder är en förhandsvisning av ett belopp, inte
 * något som rör pengar. Här provas därför båda namnen, och saknas de svarar
 * funktionen null.
 *
 * Följden av att den svarar null är dokumenterad och liten: kunden ser vad
 * modulen kostar löpande men inte vad nästa faktura landar på. Beloppet som
 * faktiskt debiteras räknas ändå av Stripe, som alltid.
 */
interface PreviewedInvoice {
  amount_due: number;
  next_payment_attempt?: number | null;
  period_end?: number | null;
}

async function previewInvoice(
  params: Record<string, unknown>
): Promise<PreviewedInvoice | null> {
  const invoices = stripe().invoices as unknown as Record<
    string,
    ((params: Record<string, unknown>) => Promise<PreviewedInvoice>) | undefined
  >;

  const call = invoices.createPreview ?? invoices.retrieveUpcoming;

  if (typeof call !== "function") {
    console.error(
      "[tillval] Stripes bibliotek har varken createPreview eller " +
        "retrieveUpcoming. Förhandsberäkningen hoppas över."
    );
    return null;
  }

  return call.call(stripe().invoices, params);
}

/**
 * Genomför ändringen hos Stripe.
 *
 * VI SKRIVER INTE MODULRADEN SJÄLVA. Stripe bekräftar via webhooken, och
 * först då ändras vår databas — samma ordning som för prenumerationen i
 * övrigt, och den enda där vi inte riskerar att ha en modul påslagen som
 * ingen faktura täcker.
 *
 * Undantaget är avstängning, se nedan.
 */
export async function applyModuleChange(params: {
  companyId: string;
  key: ModuleKey;
  on: boolean;
}): Promise<void> {
  const { subscription, interval, book } = await subscriptionFor(
    params.companyId
  );

  const updated = await stripe().subscriptions.update(subscription.id, {
    items: changedItems(book, subscription, params.key, params.on, interval),
    proration_behavior: "create_prorations",
  });

  // Skriver av det uppdaterade svaret direkt i stället för att vänta på
  // webhooken. Beskedet kommer normalt inom sekunder, men kunden laddar om
  // sidan snabbare än så — och en modul som inte syns förrän om en stund ser
  // ut som att köpet inte gick igenom.
  //
  // Webhooken skriver sedan samma sak en gång till. Det gör ingenting:
  // synkningen utgår från prenumerationens rader och ger samma resultat hur
  // många gånger den körs.
  await syncModulesFromSubscription(params.companyId, updated);
}

/**
 * Raderna att skicka till Stripe för att lägga till eller ta bort modulen.
 *
 * Bara det som ÄNDRAS skickas med. Rader som inte nämns lämnas orörda, och
 * skärmraden ska inte röras av ett modulköp.
 */
interface ItemChange {
  id?: string;
  price?: string;
  quantity?: number;
  deleted?: boolean;
}

function changedItems(
  book: PriceBook,
  subscription: Stripe.Subscription,
  key: ModuleKey,
  on: boolean,
  interval: BillingInterval
): ItemChange[] {
  const existing = moduleItemsOf(book, subscription).find(
    (item) => item.key === key
  );

  if (!on) {
    if (!existing) {
      throw new BillingChangeError("Tillvalet ligger inte på prenumerationen.");
    }

    return [{ id: existing.itemId, deleted: true }];
  }

  if (existing) {
    throw new BillingChangeError("Tillvalet är redan påslaget.");
  }

  const price = modulePriceId(book, key, interval);

  if (!price) {
    throw new BillingChangeError(
      `${MODULES[key].name} går inte att köpa med ${
        interval === "year" ? "årsbetalning" : "månadsbetalning"
      } än. Kontakta support@tikkr.se.`
    );
  }

  return [{ price, quantity: 1 }];
}

/** Prenumerationen och vilket intervall kunden betalar i. */
async function subscriptionFor(companyId: string): Promise<{
  subscription: Stripe.Subscription;
  interval: BillingInterval;
  book: PriceBook;
}> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { stripeSubscriptionId: true },
  });

  if (!company?.stripeSubscriptionId) {
    throw new BillingChangeError(
      "Tillval kan ändras först när prenumerationen är aktiv."
    );
  }

  const subscription = await stripe().subscriptions.retrieve(
    company.stripeSubscriptionId
  );

  // Modulraden ska ligga i samma intervall som skärmraden. En årsprenumeration
  // med en månadsmodul hade gett kunden en faktura i en takt de inte valt.
  const book = await priceBook();

  const interval =
    screenItemOf(book, subscription)?.price?.recurring?.interval === "year"
      ? "year"
      : "month";

  return { subscription, interval, book };
}

function subscriptionCustomerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

/* -------------------------------------------------------------------------- */
/* Att ändra antalet licenser                                                  */
/* -------------------------------------------------------------------------- */

export const MAX_LICENSES = 100;

export interface LicenseChangePreview {
  from: number;
  to: number;
  interval: BillingInterval;
  /** Vad skärmlicenserna kostar löpande EFTER ändringen. */
  recurringAmount: number;
  /** Vad de kostar idag. Skillnaden är det kunden behöver se. */
  currentAmount: number;
  /**
   * Vad nästa faktura landar på, inklusive avräkningen för resten av den
   * pågående perioden. null när Stripe inte kunde räkna fram den.
   */
  nextInvoiceAmount: number | null;
  nextInvoiceAt: Date | null;
}

/**
 * VAD ETT ÄNDRAT ANTAL LICENSER KOSTAR.
 *
 * Ändringen görs numera här och inte på Stripes egen sida. Skälet är att ett
 * tillval INTE går att lägga till där: kundportalen kan ändra antal och byta
 * pris på en befintlig rad, men inte lägga till en ny produktrad. Kunden mötte
 * därför två olika sätt att ändra samma faktura, beroende på vad de ändrade.
 *
 * Beloppet räknas fortfarande av Stripe. Det var hela poängen med att skicka
 * kunden dit, och den poängen är kvar — det är bara sidan som flyttat.
 *
 * Kort, kvitton och uppsägning ligger fortfarande hos Stripe, se
 * createPortalSession. Det är sådant vi inte ska bygga själva.
 */
export async function previewLicenseChange(params: {
  companyId: string;
  screens: number;
}): Promise<LicenseChangePreview> {
  const { subscription, interval, book } = await subscriptionFor(
    params.companyId
  );

  const item = screenItemOf(book, subscription);

  if (!item) {
    throw new BillingChangeError(
      "Prenumerationen saknar en rad för stämplingsskärmar."
    );
  }

  const from = item.quantity ?? 1;
  const to = assertLicenseCount(params.screens, from);

  const pricing = await getScreenPricing();
  const perScreen =
    interval === "year" ? (pricing.year ?? pricing.month * 12) : pricing.month;

  const upcoming = await upcomingAfter(
    subscription,
    [{ id: item.id, quantity: to }],
    "licenser"
  );

  return {
    from,
    to,
    interval,
    recurringAmount: to * perScreen,
    currentAmount: from * perScreen,
    nextInvoiceAmount: upcoming.amount,
    nextInvoiceAt: upcoming.at,
  };
}

/**
 * Genomför ändringen hos Stripe och skriver av svaret.
 *
 * Antalet läses ur det UPPDATERADE svaret och inte ur vad vi bad om. Stripe
 * är sanningen om vad kunden betalar för, och skulle de av något skäl ha satt
 * något annat ska vår siffra följa deras — inte tvärtom.
 */
export async function applyLicenseChange(params: {
  companyId: string;
  screens: number;
}): Promise<number> {
  const { subscription, book } = await subscriptionFor(params.companyId);

  const item = screenItemOf(book, subscription);

  if (!item) {
    throw new BillingChangeError(
      "Prenumerationen saknar en rad för stämplingsskärmar."
    );
  }

  const to = assertLicenseCount(params.screens, item.quantity ?? 1);

  const updated = await stripe().subscriptions.update(subscription.id, {
    items: [{ id: item.id, quantity: to }],
    proration_behavior: "create_prorations",
  });

  const quantity = screenItemOf(book, updated)?.quantity ?? to;
  await setLicenseCount(params.companyId, quantity);

  return quantity;
}

/**
 * Vägrar ett antal som inte går att debitera.
 *
 * ETT LÄGRE ANTAL ÄN DE UPPLAGDA SKÄRMARNA ÄR TILLÅTET, med flit. Vi stänger
 * ingen skärm av oss själva, och vilken som ska bort är kundens beslut — se
 * licenses.ts. Panelen påpekar skillnaden i stället.
 */
function assertLicenseCount(screens: number, current: number): number {
  const to = Math.floor(screens);

  if (!Number.isFinite(to) || to < 1) {
    throw new BillingChangeError("Antalet måste vara minst en licens.");
  }

  if (to > MAX_LICENSES) {
    throw new BillingChangeError(
      `Fler än ${MAX_LICENSES} licenser hanteras av support@tikkr.se.`
    );
  }

  if (to === current) {
    throw new BillingChangeError(`Antalet är redan ${current}.`);
  }

  return to;
}
