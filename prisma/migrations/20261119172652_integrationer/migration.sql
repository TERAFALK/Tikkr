-- CreateEnum
CREATE TYPE "IntegrationConnectionType" AS ENUM ('GATEWAY', 'OAUTH');

-- CreateEnum
CREATE TYPE "IntegrationEntityType" AS ENUM ('CUSTOMER', 'ORDER');

-- CreateEnum
CREATE TYPE "IntegrationMappingStatus" AS ENUM ('LINKED', 'PENDING', 'IGNORED');

-- CreateEnum
CREATE TYPE "GatewayCommandType" AS ENUM ('SYNC_NOW', 'FULL_RESYNC');

-- CreateEnum
CREATE TYPE "GatewayCommandStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationEventLevel" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connection_type" "IntegrationConnectionType" NOT NULL,
    "gateway_id" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "last_error_at" TIMESTAMP(3),
    "created_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "access_token_sealed" TEXT NOT NULL,
    "refresh_token_sealed" TEXT,
    "expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateways" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "machine_name" TEXT,
    "version" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "last_heartbeat_at" TIMESTAMP(3),
    "last_error" TEXT,
    "last_error_at" TIMESTAMP(3),
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_registration_tokens" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_registration_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_commands" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "gateway_id" TEXT NOT NULL,
    "integration_id" TEXT,
    "type" "GatewayCommandType" NOT NULL,
    "payload" JSONB,
    "status" "GatewayCommandStatus" NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "created_by_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acked_at" TIMESTAMP(3),

    CONSTRAINT "gateway_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_mappings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "entity_type" "IntegrationEntityType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "order_id" TEXT,
    "status" "IntegrationMappingStatus" NOT NULL DEFAULT 'PENDING',
    "pending_reason" TEXT,
    "data_hash" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_records" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "entity_type" "IntegrationEntityType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "data_hash" TEXT NOT NULL,
    "source_updated_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "integration_id" TEXT,
    "gateway_id" TEXT,
    "level" "IntegrationEventLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_company_id_provider_key" ON "integrations"("company_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_integration_id_key" ON "integration_credentials"("integration_id");

-- CreateIndex
CREATE INDEX "integration_credentials_company_id_idx" ON "integration_credentials"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "gateways_key_hash_key" ON "gateways"("key_hash");

-- CreateIndex
CREATE INDEX "gateways_company_id_idx" ON "gateways"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_registration_tokens_token_hash_key" ON "gateway_registration_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "gateway_registration_tokens_company_id_idx" ON "gateway_registration_tokens"("company_id");

-- CreateIndex
CREATE INDEX "gateway_commands_gateway_id_status_idx" ON "gateway_commands"("gateway_id", "status");

-- CreateIndex
CREATE INDEX "gateway_commands_company_id_idx" ON "gateway_commands"("company_id");

-- CreateIndex
CREATE INDEX "integration_mappings_company_id_integration_id_entity_type__idx" ON "integration_mappings"("company_id", "integration_id", "entity_type", "status");

-- CreateIndex
CREATE INDEX "integration_mappings_customer_id_idx" ON "integration_mappings"("customer_id");

-- CreateIndex
CREATE INDEX "integration_mappings_order_id_idx" ON "integration_mappings"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_mappings_integration_id_entity_type_external_id_key" ON "integration_mappings"("integration_id", "entity_type", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_mappings_integration_id_customer_id_key" ON "integration_mappings"("integration_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_mappings_integration_id_order_id_key" ON "integration_mappings"("integration_id", "order_id");

-- CreateIndex
CREATE INDEX "integration_records_company_id_idx" ON "integration_records"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_records_integration_id_entity_type_external_id_key" ON "integration_records"("integration_id", "entity_type", "external_id");

-- CreateIndex
CREATE INDEX "integration_events_company_id_integration_id_created_at_idx" ON "integration_events"("company_id", "integration_id", "created_at");

-- CreateIndex
CREATE INDEX "integration_events_company_id_created_at_idx" ON "integration_events"("company_id", "created_at");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "gateways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_registration_tokens" ADD CONSTRAINT "gateway_registration_tokens_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_commands" ADD CONSTRAINT "gateway_commands_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_commands" ADD CONSTRAINT "gateway_commands_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "gateways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_commands" ADD CONSTRAINT "gateway_commands_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_mappings" ADD CONSTRAINT "integration_mappings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_mappings" ADD CONSTRAINT "integration_mappings_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_mappings" ADD CONSTRAINT "integration_mappings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_mappings" ADD CONSTRAINT "integration_mappings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_records" ADD CONSTRAINT "integration_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_records" ADD CONSTRAINT "integration_records_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "gateways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

