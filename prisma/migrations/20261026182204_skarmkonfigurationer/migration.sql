-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "kiosk_config_id" TEXT;

-- AlterTable
ALTER TABLE "kiosk_devices" ADD COLUMN     "applied_config_version_id" TEXT,
ADD COLUMN     "config_applied_at" TIMESTAMP(3),
ADD COLUMN     "kiosk_config_id" TEXT;

-- CreateTable
CREATE TABLE "kiosk_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_config_versions" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "secrets_sealed" TEXT,
    "created_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_config_downloads" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_config_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_configs_name_key" ON "kiosk_configs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_config_versions_config_id_version_key" ON "kiosk_config_versions"("config_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_config_downloads_token_hash_key" ON "kiosk_config_downloads"("token_hash");

-- CreateIndex
CREATE INDEX "kiosk_config_downloads_expires_at_idx" ON "kiosk_config_downloads"("expires_at");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_kiosk_config_id_fkey" FOREIGN KEY ("kiosk_config_id") REFERENCES "kiosk_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_config_versions" ADD CONSTRAINT "kiosk_config_versions_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "kiosk_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_kiosk_config_id_fkey" FOREIGN KEY ("kiosk_config_id") REFERENCES "kiosk_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_applied_config_version_id_fkey" FOREIGN KEY ("applied_config_version_id") REFERENCES "kiosk_config_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

