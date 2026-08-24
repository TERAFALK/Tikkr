import { randomUUID } from "node:crypto";

/**
 * IDENTITET FÖR DEN KÖRANDE SERVERN.
 *
 * Sätts en gång när processen startar och ändras aldrig under dess livstid. En
 * ny driftsättning betyder en ny container, och därmed ett nytt id.
 *
 * Vad det används till: en panel som legat öppen över en driftsättning har
 * kvar den gamla versionens JavaScript i webbläsaren. Server Actions har ett
 * id som räknas fram ur den byggda koden, så den gamla sidan skickar ett id
 * som den nya servern inte känner igen — och Next svarar då "Failed to find
 * Server Action". Utåt ser det ut som att knappen är trasig, medan felet i
 * själva verket är att sidan är gammal.
 *
 * Panelerna frågar därför efter det här värdet med jämna mellanrum och laddar
 * om sig när det ändrats.
 *
 * Ett slumpat id och inte byggets: det senare finns inte tillgängligt på ett
 * dokumenterat sätt, och ett omstartat men oförändrat bygge ska ändå ge en
 * omladdning — cookies och sessioner klarar det, och en tom omladdning av en
 * panel kostar ingenting.
 */
export const INSTANCE_ID = randomUUID();
