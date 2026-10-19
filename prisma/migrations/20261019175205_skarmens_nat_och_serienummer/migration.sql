-- CreateEnum
CREATE TYPE "KioskNetworkType" AS ENUM ('WIFI', 'WIRED');

-- AlterTable
ALTER TABLE "kiosk_devices" ADD COLUMN     "network_type" "KioskNetworkType",
ADD COLUMN     "reported_at" TIMESTAMP(3),
ADD COLUMN     "serial_number" TEXT,
ADD COLUMN     "wifi_signal" TEXT,
ADD COLUMN     "wifi_ssid" TEXT;

