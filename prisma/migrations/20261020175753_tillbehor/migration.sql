-- CreateEnum
CREATE TYPE "ShopOrderStatus" AS ENUM ('RECEIVED', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED', 'CANCELED', 'PROBLEM');

-- CreateEnum
CREATE TYPE "ShopPaymentStatus" AS ENUM ('NOT_INVOICED', 'INVOICED', 'PAID', 'CREDITED');

-- CreateEnum
CREATE TYPE "ShopEventKind" AS ENUM ('CREATED', 'STATUS', 'PAYMENT', 'SHIPPING');

-- CreateEnum
CREATE TYPE "ShopEmailState" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "org_number" TEXT,
    "contact_name" TEXT,
    "order_email" TEXT,
    "phone" TEXT,
    "address_line" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "delivery_reference" TEXT,
    "billing_address_line" TEXT,
    "billing_postal_code" TEXT,
    "billing_city" TEXT,
    "invoice_email" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_orders" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "ShopOrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "payment_status" "ShopPaymentStatus" NOT NULL DEFAULT 'NOT_INVOICED',
    "idempotency_key" TEXT NOT NULL,
    "placed_by_email" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "org_number" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address_line" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Sverige',
    "reference" TEXT,
    "billing_address_line" TEXT,
    "billing_postal_code" TEXT,
    "billing_city" TEXT,
    "invoice_email" TEXT,
    "goods_ore" INTEGER NOT NULL,
    "shipping_ore" INTEGER,
    "vat_ore" INTEGER NOT NULL,
    "total_ore" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "carrier" TEXT,
    "tracking_url" TEXT,
    "shipped_at" TIMESTAMP(3),
    "invoice_number" TEXT,
    "invoiced_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_lines" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit_price_ore" INTEGER NOT NULL,
    "vat_rate_percent" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal_ore" INTEGER NOT NULL,
    "vat_ore" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shop_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "kind" "ShopEventKind" NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "detail" TEXT,
    "customer_message" TEXT,
    "actor_email" TEXT NOT NULL,
    "email_state" "ShopEmailState",
    "emailed_at" TIMESTAMP(3),
    "email_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_notes" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "target_company_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_order_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_prices" (
    "product_key" TEXT NOT NULL,
    "price_ore" INTEGER NOT NULL,
    "updated_by_email" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_prices_pkey" PRIMARY KEY ("product_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_company_id_key" ON "company_profiles"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_number_key" ON "shop_orders"("number");

-- CreateIndex
CREATE INDEX "shop_orders_company_id_created_at_idx" ON "shop_orders"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "shop_orders_status_created_at_idx" ON "shop_orders"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_company_id_idempotency_key_key" ON "shop_orders"("company_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "shop_order_lines_order_id_idx" ON "shop_order_lines"("order_id");

-- CreateIndex
CREATE INDEX "shop_order_lines_company_id_idx" ON "shop_order_lines"("company_id");

-- CreateIndex
CREATE INDEX "shop_order_events_order_id_created_at_idx" ON "shop_order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "shop_order_events_company_id_idx" ON "shop_order_events"("company_id");

-- CreateIndex
CREATE INDEX "shop_order_notes_order_id_created_at_idx" ON "shop_order_notes"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "shop_order_notes_target_company_id_idx" ON "shop_order_notes"("target_company_id");

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_lines" ADD CONSTRAINT "shop_order_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_lines" ADD CONSTRAINT "shop_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_events" ADD CONSTRAINT "shop_order_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_events" ADD CONSTRAINT "shop_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Beställningarnas löpnummer börjar på 1001. "Beställning 1" ser ut som ett
-- test, och ett fyrsiffrigt nummer är lättare att läsa upp i telefon.
ALTER SEQUENCE "shop_orders_number_seq" RESTART WITH 1001;
