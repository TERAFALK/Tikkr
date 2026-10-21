-- CreateEnum
CREATE TYPE "ShopProductKind" AS ENUM ('GOODS', 'SERVICE');

-- AlterTable
ALTER TABLE "shop_order_lines" ADD COLUMN     "product_kind" "ShopProductKind" NOT NULL DEFAULT 'GOODS';

-- CreateTable
CREATE TABLE "shop_products" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "ShopProductKind" NOT NULL DEFAULT 'GOODS',
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price_ore" INTEGER NOT NULL,
    "vat_rate_percent" INTEGER NOT NULL DEFAULT 25,
    "max_quantity" INTEGER NOT NULL DEFAULT 20,
    "delivery" TEXT NOT NULL DEFAULT '',
    "warranty" TEXT NOT NULL DEFAULT '',
    "benefits" JSONB NOT NULL DEFAULT '[]',
    "included" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specs" JSONB NOT NULL DEFAULT '[]',
    "in_shop" BOOLEAN NOT NULL DEFAULT false,
    "on_site" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_images" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "data" BYTEA,
    "mime_type" TEXT,
    "static_path" TEXT,
    "alt" TEXT NOT NULL DEFAULT '',
    "illustration" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_product_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_products_key_key" ON "shop_products"("key");

-- CreateIndex
CREATE UNIQUE INDEX "shop_products_slug_key" ON "shop_products"("slug");

-- CreateIndex
CREATE INDEX "shop_products_sort_order_idx" ON "shop_products"("sort_order");

-- CreateIndex
CREATE INDEX "shop_product_images_product_id_sort_order_idx" ON "shop_product_images"("product_id", "sort_order");

-- AddForeignKey
ALTER TABLE "shop_product_images" ADD CONSTRAINT "shop_product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- STÄMPLINGSSKÄRMEN FLYTTAR FRÅN KODEN TILL DATABASEN.
--
-- Texterna är katalogens i src/lib/shop/catalog.ts som de stod före den här
-- versionen. Priset tas från shop_prices om det satts i plattformspanelen,
-- annars katalogens. shop_prices står kvar orörd, så att föregående version
-- fungerar mot den nya databasen (CLAUDE.md § 0 punkt 7), och tas bort i en
-- senare release.
INSERT INTO "shop_products" (
  "id", "key", "slug", "kind", "name", "summary", "description",
  "price_ore", "vat_rate_percent", "max_quantity", "delivery", "warranty",
  "benefits", "included", "requirements", "specs",
  "in_shop", "on_site", "sort_order", "updated_by_email", "updated_at"
) VALUES (
  'prod_stamplingsskarm', 'STAMPLINGSSKARM', 'stamplingsskarm', 'GOODS', 'Stämplingsskärm', 'Pekskärm på 23,6 tum i stativ, uppsatt för Tikkr och klar att ansluta.',
  'En stämplingsskärm som är uppsatt och provad innan den lämnar oss. Ni ansluter ström och nätverkskabel och kopplar den till er arbetsyta med en kod från panelen.

Skärmen visar bara stämplingen och startar i den av sig själv. Den är fläktlös och utformad för att stå på dygnet runt.',
  COALESCE((SELECT "price_ore" FROM "shop_prices" WHERE "product_key" = 'STAMPLINGSSKARM'), 2490000),
  25, 20, 'Tillverkas på beställning. Beräknad leveranstid 3–4 veckor.', 'Tre års garanti på skärm och stativ mot fel i material och tillverkning, räknat från leveransen. Gäller inte skador av yttre åverkan eller användning utanför specifikationen.',
  '[{"title":"Klar att ansluta","body":"Uppsatt och provad före leverans. Ström, nätverkskabel och en kod från panelen, sedan går det att stämpla."},{"title":"Bara stämplingen","body":"Skärmen startar direkt i stämplingen när strömmen slås på, även efter ett strömavbrott, och visar ingenting annat."},{"title":"Fortsätter utan nätverk","body":"Tappar skärmen anslutningen sparas stämplingarna på skärmen och skickas när anslutningen är tillbaka."},{"title":"Styrs från panelen","body":"Under Stämplingsskärmar syns serienummer, anslutning och senaste kontakt. Där ändras ljusstyrkan och skärmen startas om."},{"title":"Byggd för att stå på","body":"Fläktlös, utan batteri och utformad för drift dygnet runt."},{"title":"Stativ ingår","body":"Pulverlackerat stativ. Skärmen har även VESA 100 för väggfäste."}]'::JSONB,
  ARRAY['Pekskärm 23,6 tum', 'Pulverlackerat stativ', 'Nätadapter 12 V', 'Uppsättning och provning före leverans', 'Tre års garanti på skärm och stativ']::TEXT[],
  ARRAY['Eluttag vid skärmen', 'Nätverksuttag vid skärmen. Wi-Fi fungerar också, men kabel rekommenderas', 'En licens i prenumerationen per skärm']::TEXT[],
  '[{"title":"Skärm","rows":[{"label":"Storlek","value":"23,6 tum"},{"label":"Upplösning","value":"1920 × 1080"},{"label":"Pekskärm","value":"Kapacitiv, tio samtidiga tryck"},{"label":"Ljusstyrka","value":"250 cd/m²"},{"label":"Glas","value":"Reflexfritt, 2 mm"}]},{"title":"Dator","rows":[{"label":"Processor","value":"Rockchip RK3399"},{"label":"Minne","value":"4 GB"},{"label":"Lagring","value":"16 GB"},{"label":"Operativsystem","value":"Android"}]},{"title":"Nätverk","rows":[{"label":"Kabel","value":"Gigabit Ethernet (RJ45), rekommenderas"},{"label":"Wi-Fi","value":"802.11 a/b/g/n"},{"label":"Nätverksinloggning","value":"IEEE 802.1X"}]},{"title":"Ström och mått","rows":[{"label":"Strömförsörjning","value":"12 V nätadapter, ingår"},{"label":"Effekt","value":"40–60 W"},{"label":"Mått utan stativ","value":"576 × 345 × 44 mm"},{"label":"Vikt utan stativ","value":"7,2 kg"},{"label":"Montering","value":"VESA 100"},{"label":"Drifttemperatur","value":"0–40 °C"},{"label":"Kylning","value":"Fläktlös"}]}]'::JSONB,
  TRUE, TRUE, 0, 'migration', CURRENT_TIMESTAMP
);

INSERT INTO "shop_product_images" ("id", "product_id", "static_path", "alt", "illustration", "sort_order")
VALUES ('img_stamplingsskarm_1', 'prod_stamplingsskarm', '/tillbehor/stamplingsskarm/framifran.svg', 'Stämplingsskärmen i sitt stativ, framifrån', TRUE, 0);
INSERT INTO "shop_product_images" ("id", "product_id", "static_path", "alt", "illustration", "sort_order")
VALUES ('img_stamplingsskarm_2', 'prod_stamplingsskarm', '/tillbehor/stamplingsskarm/verkstad.svg', 'Stämplingsskärmen vid en vägg i en verkstad', TRUE, 1);
INSERT INTO "shop_product_images" ("id", "product_id", "static_path", "alt", "illustration", "sort_order")
VALUES ('img_stamplingsskarm_3', 'prod_stamplingsskarm', '/tillbehor/stamplingsskarm/detalj.svg', 'Skärmens baksida med VESA-fäste och stativets pelare', TRUE, 2);
