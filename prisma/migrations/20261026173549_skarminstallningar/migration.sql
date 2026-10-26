-- CreateTable
CREATE TABLE "kiosk_setting_defaults" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by_email" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_setting_defaults_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "company_kiosk_settings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_kiosk_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_kiosk_settings_company_id_idx" ON "company_kiosk_settings"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_kiosk_settings_company_id_key_key" ON "company_kiosk_settings"("company_id", "key");

-- AddForeignKey
ALTER TABLE "company_kiosk_settings" ADD CONSTRAINT "company_kiosk_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

