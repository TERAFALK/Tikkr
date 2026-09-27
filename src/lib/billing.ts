import type Stripe from "stripe";
import { unsafeGlobalPrisma } from "./db";
import { getLicenseState, setLicenseCount } from "./licenses";
import { enabledModules } from "./company-modules";
import { MODULES, MODULE_KEYS, type ModuleKey } from "./modules";
import { priceBook, type PriceBook } from "./price-book";
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
 * Vad kunden betalar för: antalet licenser de valt.
 *
 * Inte antalet skapade skärmar. Kostnaden ska aldrig växa av sig själv för att
 * någon lagt upp en skärm till — kunden bestämmer antalet, och skapar sedan
 * skärmar inom det.
 */
export async function billedScreens(companyId: string): Promise<number> {
  const state = await getLicenseState(companyId);
  return state.total;
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
 * Öppnar Stripes sida där kunden ändrar antalet licenser.
 *
 * Antalet väljs och bekräftas i ett och samma steg hos Stripe, inte här. Skälet
 * är att beloppet ska räknas fram av den part som faktiskt debiterar, i samma
 * stund som antalet ändras — en siffra vi räknat ut i förväg är en gissning om
 * vad Stripe kommer att fakturera, och en gissning duger inte för något som
 * ändrar en faktura.
 *
 * Antalet skrivs in i vår databas först när Stripe bekräftar ändringen.
 * Avbryter kunden har ingenting hänt.
 *
 * Utan prenumeration går antalet inte att ändra. Under provperioden ingår ett
 * fast antal, och fler får man genom att börja betala.
 */
export async function openLicenseUpdate(params: {
  companyId: string;
  baseUrl: string;
}): Promise<string> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: params.companyId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });

  if (!company?.stripeSubscriptionId || !company.stripeCustomerId) {
    throw new Error(
      "Antalet licenser kan ändras först när prenumerationen är aktiv."
    );
  }

  // Saknas en egen konfiguration används kontots standardportal. Den duger så
  // länge kvantitetsändring är påslagen där, och ett fel i vår konfiguration
  // ska inte vara skillnaden mellan att kunden kan köpa en skärm till eller
  // inte.
  const configuration = await licenseUpdateConfiguration();

  const session = await stripe().billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    ...(configuration && { configuration }),
    return_url: `${params.baseUrl}/admin/installningar/prenumeration`,

    flow_data: {
      type: "subscription_update",
      subscription_update: { subscription: company.stripeSubscriptionId },
      after_completion: {
        type: "redirect",
        redirect: {
          return_url: `${params.baseUrl}/admin/installningar/prenumeration?uppdaterad=1`,
        },
      },
    },
  });

  return session.url;
}

/**
 * Portalkonfigurationen som tillåter ändrat antal.
 *
 * Stripes bekräftelsesida kräver att kundportalen har kvantitetsändring
 * påslagen. Vi skapar därför en egen konfiguration som bara gör den enda
 * saken, istället för att be någon klicka rätt i Stripes gränssnitt — då
 * fungerar det likadant i labbet som i skarp drift, utan manuella steg.
 *
 * Den vanliga kundportalen (kort, kvitton, uppsägning) rörs inte: den använder
 * fortfarande Stripes standardkonfiguration.
 */
const CONFIGURATION_MARKER = "tikkr-license-update";
let licenseConfigurationId: string | null = null;

async function licenseUpdateConfiguration(): Promise<string | null> {
  const fromEnv = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  if (fromEnv) return fromEnv;

  if (licenseConfigurationId) return licenseConfigurationId;

  try {
    // Letar upp en tidigare skapad först. Appen startas om vid varje deploy,
    // och en ny konfiguration per omstart skulle fylla Stripe-kontot med
    // dubbletter.
    const existing = await stripe().billingPortal.configurations.list({
      active: true,
      limit: 100,
    });

    const found = existing.data.find(
      (item) => item.metadata?.tikkr === CONFIGURATION_MARKER
    );

    if (found) {
      // ARTIKELLISTAN SKRIVS OM PÅ EN BEFINTLIG KONFIGURATION. Den skapades
      // innan tillvalen fanns och känner därför inte modulernas produkter —
      // och en portal som inte känner dem vägrar öppna prenumerationen alls.
      // Ett anrop per processtart, och det ger samma resultat hur många
      // gånger det körs.
      await stripe().billingPortal.configurations.update(found.id, {
        features: {
          subscription_update: {
            enabled: true,
            default_allowed_updates: ["quantity"],
            proration_behavior: "create_prorations",
            products: await updatableProducts(),
          },
        },
      });

      licenseConfigurationId = found.id;
      return found.id;
    }

    const created = await stripe().billingPortal.configurations.create({
      metadata: { tikkr: CONFIGURATION_MARKER },
      business_profile: { headline: "Antal stämplingsskärmar" },

      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["quantity"],

          // Samma avräkning som tidigare: en skärm som läggs till mitt i
          // perioden kostar resterande dagar, varken en hel period eller noll.
          proration_behavior: "create_prorations",
          products: await updatableProducts(),
        },

        // Kortbyte MÅSTE vara påslaget. Stripe vägrar annars skapa
        // konfigurationen: "Cannot enable subscription updates while payment
        // method update is disabled." Rimligt nog — en höjning kan kräva att
        // kortet går att byta för att gå igenom.
        //
        // Det syns ändå inte här. Kunden landar direkt på sidan för antal,
        // eftersom sessionen styrs av flow_data.
        payment_method_update: { enabled: true },

        // Resten stängs av. Kvitton och uppsägning ligger kvar i den vanliga
        // kundportalen, dit knappen "Hantera betalning och fakturor" leder.
        invoice_history: { enabled: false },
        customer_update: { enabled: false },
        subscription_cancel: { enabled: false },
      },
    });

    licenseConfigurationId = created.id;
    return created.id;
  } catch (error) {
    // Vanligaste orsaken i skarpt läge: Stripe kräver att kundportalens
    // villkors- och integritetslänkar är ifyllda innan en konfiguration får
    // skapas. Vi ger inte upp för det — kontots standardportal används i
    // stället, och fungerar så länge kvantitetsändring är påslagen där.
    console.error(
      "Kunde inte skapa portalkonfiguration hos Stripe, använder kontots " +
        "standardkonfiguration i stället",
      error
    );

    return null;
  }
}

/**
 * Artiklarna kunden får ändra antal på. Priserna kan ligga på samma produkt.
 *
 * MODULERNAS ARTIKLAR MÅSTE MED, även om ingen ska ändra antal på dem. Stripes
 * kundportal vägrar öppna en prenumeration som innehåller en produkt som inte
 * står i konfigurationen — och sedan tillvalen finns kan prenumerationen
 * innehålla dem. Utan de här raderna slutar knappen "Ändra antal licenser"
 * fungera för just de kunder som köpt mest.
 *
 * Följden är att en kund i teorin kan skruva upp antalet löneunderlag till
 * tre hos Stripe. Vår synkning bryr sig inte om kvantiteten — modulen är på
 * eller av — så det skulle bara betyda att de betalar för mycket, vilket de
 * kan ändra tillbaka på samma sida. Stripe erbjuder inget sätt att lista en
 * produkt utan att tillåta kvantitet.
 */
async function updatableProducts() {
  const byProduct = new Map<string, string[]>();
  const book = await priceBook();

  const ids = [
    book.screen.month,
    book.screen.year,
    ...MODULE_KEYS.flatMap((key) => [
      modulePriceId(book, key, "month"),
      modulePriceId(book, key, "year"),
    ]),
  ].filter((id): id is string => Boolean(id));

  for (const id of ids) {
    const price = await stripe().prices.retrieve(id);
    const product =
      typeof price.product === "string" ? price.product : price.product.id;

    byProduct.set(product, [...(byProduct.get(product) ?? []), id]);
  }

  return [...byProduct].map(([product, prices]) => ({ product, prices }));
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
  /** Priset i det intervall kunden betalar i. */
  amount: number;
  /** false när artikeln saknas hos Stripe. Modulen går då inte att köpa. */
  forSale: boolean;
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
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  interval: BillingInterval | null;
  /** Priset per skärm, hämtat från artikeln hos betaltjänsten. */
  pricing: ScreenPricing;
  /** Tillvalen, med läge och pris i kundens intervall. */
  modules: ModuleOffer[];
  /** Summan av de påslagna tillvalen, i kundens intervall. */
  moduleAmount: number;
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
  interval: BillingInterval
): ModuleOffer[] {
  return MODULE_KEYS.map((key) => {
    const price = pricing[key];

    return {
      key,
      name: MODULES[key].name,
      summary: MODULES[key].summary,
      enabled: enabled.includes(key),
      amount:
        interval === "year" ? (price.year ?? price.month * 12) : price.month,
      forSale: Boolean(modulePriceId(book, key, interval)),
    };
  });
}

/** Vad kunden ser på prenumerationssidan. */
export async function getBillingOverview(
  companyId: string
): Promise<BillingOverview> {
  const [licenses, pricing, modulePricing, book] = await Promise.all([
    getLicenseState(companyId),
    getScreenPricing(),
    getModulePricing(),
    priceBook(),
  ]);

  const screens = licenses.total;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { stripeSubscriptionId: true },
  });

  const amounts = (count: number) => ({
    monthlyAmount: count * pricing.month,
    yearlyAmount: pricing.year === null ? null : count * pricing.year,
    yearlySaving:
      pricing.year === null ? null : count * (pricing.month * 12 - pricing.year),
  });

  const overview: BillingOverview = {
    screens,
    used: licenses.used,
    ...amounts(screens),
    hasSubscription: Boolean(company?.stripeSubscriptionId),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    interval: null,
    pricing,
    modules: [],
    moduleAmount: 0,
  };

  // Tillvalen räknas fram sist, när intervallet är känt. Utan prenumeration
  // finns inget intervall, och månad är då det pris kunden kommer att möta.
  const describeModules = async (interval: BillingInterval) => {
    const enabled = await enabledModules(companyId);

    overview.modules = moduleOffers(book, modulePricing, enabled, interval);
    overview.moduleAmount = overview.modules
      .filter((module) => module.enabled)
      .reduce((sum, module) => sum + module.amount, 0);
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

export class ModuleChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleChangeError";
  }
}

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
 * Samma princip som står motiverad vid openLicenseUpdate ovan: beloppet ska
 * räknas fram av den part som faktiskt debiterar. En siffra vi räknat ut i
 * förväg är en gissning om vad Stripe kommer att fakturera, och en gissning
 * duger inte för något som ändrar en faktura.
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

  try {
    const upcoming = await previewInvoice({
      customer: subscriptionCustomerId(subscription),
      subscription: subscription.id,
      subscription_details: {
        items,

        // Samma avräkning som vid ändrat antal licenser: en modul som läggs
        // till mitt i perioden kostar resterande dagar, varken en hel period
        // eller noll.
        proration_behavior: "create_prorations",
      },
    });

    if (upcoming) {
      preview.nextInvoiceAmount = upcoming.amount_due / 100;

      // Fältet heter olika i olika versioner av Stripes API, precis som
      // periodslutet ovan. Vi läser båda och tar det som finns.
      const at = upcoming.next_payment_attempt ?? upcoming.period_end;
      preview.nextInvoiceAt = at ? new Date(at * 1000) : null;
    }
  } catch (error) {
    console.error(
      "[tillval] Kunde inte hämta förhandsberäkningen från Stripe:",
      error instanceof Error ? error.message : error
    );
  }

  return preview;
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
      throw new ModuleChangeError("Tillvalet ligger inte på prenumerationen.");
    }

    return [{ id: existing.itemId, deleted: true }];
  }

  if (existing) {
    throw new ModuleChangeError("Tillvalet är redan påslaget.");
  }

  const price = modulePriceId(book, key, interval);

  if (!price) {
    throw new ModuleChangeError(
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
    throw new ModuleChangeError(
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
