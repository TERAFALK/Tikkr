-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "CompanyModuleKey" AS ENUM ('PAYROLL', 'PLANNING');

-- CreateEnum
CREATE TYPE "ModuleSource" AS ENUM ('STRIPE', 'MANUAL');

-- CreateEnum
CREATE TYPE "TimeEntryKind" AS ENUM ('ORDER', 'INDIRECT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('KIOSK', 'KIOSK_OFFLINE_SYNC', 'ADMIN_MANUAL', 'AUTO_CLOSE');

-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('MAINTENANCE', 'INCIDENT', 'INFO');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trial_ends_at" TIMESTAMP(3),
    "past_due_since" TIMESTAMP(3),
    "screen_licenses" INTEGER NOT NULL DEFAULT 2,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "subscription_interval" TEXT,
    "auto_close_at" TEXT NOT NULL DEFAULT '18:00',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Stockholm',
    "markup_percent" INTEGER NOT NULL DEFAULT 100,
    "logo_square_data" BYTEA,
    "logo_square_mime_type" TEXT,
    "logo_wide_data" BYTEA,
    "logo_wide_mime_type" TEXT,
    "logo_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "employee_number" TEXT,
    "cost_rate_ore" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "photo_data" BYTEA,
    "photo_mime_type" TEXT,
    "photo_updated_at" TIMESTAMP(3),
    "schedule_id" TEXT,
    "flex_code_hash" TEXT,
    "flex_opening_minutes" INTEGER NOT NULL DEFAULT 0,
    "comp_opening_minutes" INTEGER NOT NULL DEFAULT 0,
    "hourly" BOOLEAN NOT NULL DEFAULT false,
    "balance_opening_date" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer_number" TEXT,
    "org_number" TEXT,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address_line" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "markup_percent" INTEGER,
    "discount_percent" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "customer_id" TEXT,
    "is_quick_job" BOOLEAN NOT NULL DEFAULT false,
    "fixed_price_ore" INTEGER,
    "markup_percent" INTEGER,
    "planned_due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_moments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cost_rate_ore" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_budgets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "moment_id" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indirect_moments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indirect_moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "kind" "TimeEntryKind" NOT NULL DEFAULT 'ORDER',
    "order_id" TEXT,
    "moment_id" TEXT,
    "indirect_moment_id" TEXT,
    "clock_in_at" TIMESTAMP(3) NOT NULL,
    "clock_out_at" TIMESTAMP(3),
    "source" "TimeEntrySource" NOT NULL DEFAULT 'KIOSK',
    "moment_cost_rate_ore" INTEGER,
    "employee_cost_rate_ore" INTEGER,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_note" TEXT,
    "client_punch_id" TEXT,
    "clock_out_punch_id" TEXT,
    "kiosk_device_id" TEXT,
    "source_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "password_changed_at" TIMESTAMP(3),
    "sessions_revoked_at" TIMESTAMP(3),
    "email_verified_at" TIMESTAMP(3),
    "totp_secret" TEXT,
    "totp_enabled_at" TIMESTAMP(3),
    "totp_last_step" INTEGER,
    "login_code_hash" TEXT,
    "login_code_expires_at" TIMESTAMP(3),
    "login_code_sent_at" TIMESTAMP(3),

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_from_ip" TEXT,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_users" (
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret" TEXT,
    "totp_last_step" INTEGER,
    "totp_enabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "revenue_snapshots" (
    "day" TIMESTAMP(3) NOT NULL,
    "mrr" INTEGER NOT NULL,
    "paying_companies" INTEGER NOT NULL,
    "trialing_companies" INTEGER NOT NULL,
    "licenses_sold" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_snapshots_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "support_visits" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_state" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_state_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "system_notices" (
    "id" TEXT NOT NULL,
    "kind" "NoticeKind" NOT NULL DEFAULT 'MAINTENANCE',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "show_in_admin" BOOLEAN NOT NULL DEFAULT true,
    "show_on_kiosk" BOOLEAN NOT NULL DEFAULT false,
    "show_on_site" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_log" (
    "id" TEXT NOT NULL,
    "actor_email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_company_id" TEXT,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_notes" (
    "target_company_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_by_email" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_notes_pkey" PRIMARY KEY ("target_company_id")
);

-- CreateTable
CREATE TABLE "stripe_prices" (
    "item" TEXT NOT NULL,
    "month_price_id" TEXT,
    "year_price_id" TEXT,
    "updated_by_email" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_prices_pkey" PRIMARY KEY ("item")
);

-- CreateTable
CREATE TABLE "company_prices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "monthly_ore" INTEGER NOT NULL,
    "updated_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_invites" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "invited_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_devices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT,
    "pairing_code_hash" TEXT,
    "pairing_expires_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "fully_version" TEXT,
    "webview_version" TEXT,
    "brightness" INTEGER,
    "restart_requested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_days" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_breaks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "schedule_day_id" TEXT NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "break_type_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_types" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "break_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "break_type_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "source" "TimeEntrySource" NOT NULL DEFAULT 'KIOSK',
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_note" TEXT,
    "client_punch_id" TEXT,
    "kiosk_device_id" TEXT,
    "source_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "break_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason_id" TEXT NOT NULL,
    "minutes" INTEGER,
    "note" TEXT,
    "created_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_reasons" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "counts_as_comp" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comp_adjustments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "created_by_email" TEXT NOT NULL,
    "absence_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comp_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "moment_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_days" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "station_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_breaks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "station_day_id" TEXT NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "station_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_blocks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "moment_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "created_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planned_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_modules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "module" "CompanyModuleKey" NOT NULL,
    "source" "ModuleSource" NOT NULL DEFAULT 'MANUAL',
    "stripe_item_id" TEXT,
    "enabled_by" TEXT,
    "enabled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "actor_email" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "subject_employee_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_stripe_customer_id_key" ON "companies"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_stripe_subscription_id_key" ON "companies"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "employees_company_id_active_idx" ON "employees"("company_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_employee_number_key" ON "employees"("company_id", "employee_number");

-- CreateIndex
CREATE INDEX "customers_company_id_active_idx" ON "customers"("company_id", "active");

-- CreateIndex
CREATE INDEX "customers_company_id_name_idx" ON "customers"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_customer_number_key" ON "customers"("company_id", "customer_number");

-- CreateIndex
CREATE INDEX "orders_company_id_status_idx" ON "orders"("company_id", "status");

-- CreateIndex
CREATE INDEX "orders_company_id_is_quick_job_idx" ON "orders"("company_id", "is_quick_job");

-- CreateIndex
CREATE UNIQUE INDEX "orders_company_id_order_number_key" ON "orders"("company_id", "order_number");

-- CreateIndex
CREATE INDEX "work_moments_company_id_active_idx" ON "work_moments"("company_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "work_moments_company_id_name_key" ON "work_moments"("company_id", "name");

-- CreateIndex
CREATE INDEX "order_budgets_company_id_order_id_idx" ON "order_budgets"("company_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_budgets_order_id_moment_id_key" ON "order_budgets"("order_id", "moment_id");

-- CreateIndex
CREATE INDEX "indirect_moments_company_id_active_idx" ON "indirect_moments"("company_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "indirect_moments_company_id_name_key" ON "indirect_moments"("company_id", "name");

-- CreateIndex
CREATE INDEX "time_entries_company_id_employee_id_clock_out_at_idx" ON "time_entries"("company_id", "employee_id", "clock_out_at");

-- CreateIndex
CREATE INDEX "time_entries_company_id_clock_in_at_idx" ON "time_entries"("company_id", "clock_in_at");

-- CreateIndex
CREATE INDEX "time_entries_company_id_order_id_idx" ON "time_entries"("company_id", "order_id");

-- CreateIndex
CREATE INDEX "time_entries_company_id_indirect_moment_id_idx" ON "time_entries"("company_id", "indirect_moment_id");

-- CreateIndex
CREATE INDEX "time_entries_company_id_kind_clock_in_at_idx" ON "time_entries"("company_id", "kind", "clock_in_at");

-- CreateIndex
CREATE INDEX "time_entries_company_id_needs_review_idx" ON "time_entries"("company_id", "needs_review");

-- CreateIndex
CREATE INDEX "time_entries_company_id_clock_out_punch_id_idx" ON "time_entries"("company_id", "clock_out_punch_id");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_company_id_client_punch_id_key" ON "time_entries"("company_id", "client_punch_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_company_id_idx" ON "admin_users"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_user_id_used_at_idx" ON "password_resets"("user_id", "used_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_token_hash_key" ON "email_verifications"("token_hash");

-- CreateIndex
CREATE INDEX "email_verifications_user_id_used_at_idx" ON "email_verifications"("user_id", "used_at");

-- CreateIndex
CREATE INDEX "support_visits_company_id_started_at_idx" ON "support_visits"("company_id", "started_at");

-- CreateIndex
CREATE INDEX "support_visits_started_at_idx" ON "support_visits"("started_at");

-- CreateIndex
CREATE INDEX "system_notices_archived_at_starts_at_idx" ON "system_notices"("archived_at", "starts_at");

-- CreateIndex
CREATE INDEX "platform_audit_log_target_company_id_created_at_idx" ON "platform_audit_log"("target_company_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_audit_log_created_at_idx" ON "platform_audit_log"("created_at");

-- CreateIndex
CREATE INDEX "company_prices_company_id_idx" ON "company_prices"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_prices_company_id_item_key" ON "company_prices"("company_id", "item");

-- CreateIndex
CREATE UNIQUE INDEX "admin_invites_token_hash_key" ON "admin_invites"("token_hash");

-- CreateIndex
CREATE INDEX "admin_invites_company_id_accepted_at_idx" ON "admin_invites"("company_id", "accepted_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_invites_company_id_email_key" ON "admin_invites"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_token_hash_key" ON "kiosk_devices"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_pairing_code_hash_key" ON "kiosk_devices"("pairing_code_hash");

-- CreateIndex
CREATE INDEX "kiosk_devices_company_id_idx" ON "kiosk_devices"("company_id");

-- CreateIndex
CREATE INDEX "work_schedules_company_id_is_default_idx" ON "work_schedules"("company_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_company_id_name_key" ON "work_schedules"("company_id", "name");

-- CreateIndex
CREATE INDEX "schedule_days_company_id_schedule_id_idx" ON "schedule_days"("company_id", "schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_days_schedule_id_weekday_key" ON "schedule_days"("schedule_id", "weekday");

-- CreateIndex
CREATE INDEX "schedule_breaks_company_id_schedule_day_id_idx" ON "schedule_breaks"("company_id", "schedule_day_id");

-- CreateIndex
CREATE INDEX "break_types_company_id_active_idx" ON "break_types"("company_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "break_types_company_id_name_key" ON "break_types"("company_id", "name");

-- CreateIndex
CREATE INDEX "break_entries_company_id_employee_id_ended_at_idx" ON "break_entries"("company_id", "employee_id", "ended_at");

-- CreateIndex
CREATE INDEX "break_entries_company_id_started_at_idx" ON "break_entries"("company_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "break_entries_company_id_client_punch_id_key" ON "break_entries"("company_id", "client_punch_id");

-- CreateIndex
CREATE INDEX "absences_company_id_employee_id_date_idx" ON "absences"("company_id", "employee_id", "date");

-- CreateIndex
CREATE INDEX "absences_company_id_date_idx" ON "absences"("company_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "absences_employee_id_date_reason_id_key" ON "absences"("employee_id", "date", "reason_id");

-- CreateIndex
CREATE INDEX "absence_reasons_company_id_active_idx" ON "absence_reasons"("company_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "absence_reasons_company_id_name_key" ON "absence_reasons"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "comp_adjustments_absence_id_key" ON "comp_adjustments"("absence_id");

-- CreateIndex
CREATE INDEX "comp_adjustments_company_id_employee_id_date_idx" ON "comp_adjustments"("company_id", "employee_id", "date");

-- CreateIndex
CREATE INDEX "stations_company_id_active_idx" ON "stations"("company_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "stations_company_id_name_key" ON "stations"("company_id", "name");

-- CreateIndex
CREATE INDEX "station_days_company_id_station_id_idx" ON "station_days"("company_id", "station_id");

-- CreateIndex
CREATE UNIQUE INDEX "station_days_station_id_weekday_key" ON "station_days"("station_id", "weekday");

-- CreateIndex
CREATE INDEX "station_breaks_company_id_station_day_id_idx" ON "station_breaks"("company_id", "station_day_id");

-- CreateIndex
CREATE INDEX "planned_blocks_company_id_station_id_starts_at_idx" ON "planned_blocks"("company_id", "station_id", "starts_at");

-- CreateIndex
CREATE INDEX "planned_blocks_company_id_order_id_idx" ON "planned_blocks"("company_id", "order_id");

-- CreateIndex
CREATE INDEX "planned_blocks_company_id_starts_at_idx" ON "planned_blocks"("company_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "company_modules_company_id_module_key" ON "company_modules"("company_id", "module");

-- CreateIndex
CREATE INDEX "audit_events_company_id_entity_entity_id_created_at_idx" ON "audit_events"("company_id", "entity", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_company_id_created_at_idx" ON "audit_events"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_company_id_subject_employee_id_idx" ON "audit_events"("company_id", "subject_employee_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_moments" ADD CONSTRAINT "work_moments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_budgets" ADD CONSTRAINT "order_budgets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_budgets" ADD CONSTRAINT "order_budgets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_budgets" ADD CONSTRAINT "order_budgets_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "work_moments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indirect_moments" ADD CONSTRAINT "indirect_moments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "work_moments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_indirect_moment_id_fkey" FOREIGN KEY ("indirect_moment_id") REFERENCES "indirect_moments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_kiosk_device_id_fkey" FOREIGN KEY ("kiosk_device_id") REFERENCES "kiosk_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_visits" ADD CONSTRAINT "support_visits_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_prices" ADD CONSTRAINT "company_prices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_days" ADD CONSTRAINT "schedule_days_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_days" ADD CONSTRAINT "schedule_days_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_breaks" ADD CONSTRAINT "schedule_breaks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_breaks" ADD CONSTRAINT "schedule_breaks_schedule_day_id_fkey" FOREIGN KEY ("schedule_day_id") REFERENCES "schedule_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_breaks" ADD CONSTRAINT "schedule_breaks_break_type_id_fkey" FOREIGN KEY ("break_type_id") REFERENCES "break_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_types" ADD CONSTRAINT "break_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_entries" ADD CONSTRAINT "break_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_entries" ADD CONSTRAINT "break_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_entries" ADD CONSTRAINT "break_entries_break_type_id_fkey" FOREIGN KEY ("break_type_id") REFERENCES "break_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "absence_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_reasons" ADD CONSTRAINT "absence_reasons_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comp_adjustments" ADD CONSTRAINT "comp_adjustments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comp_adjustments" ADD CONSTRAINT "comp_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "work_moments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_days" ADD CONSTRAINT "station_days_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_days" ADD CONSTRAINT "station_days_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_breaks" ADD CONSTRAINT "station_breaks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_breaks" ADD CONSTRAINT "station_breaks_station_day_id_fkey" FOREIGN KEY ("station_day_id") REFERENCES "station_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_blocks" ADD CONSTRAINT "planned_blocks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_blocks" ADD CONSTRAINT "planned_blocks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_blocks" ADD CONSTRAINT "planned_blocks_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_blocks" ADD CONSTRAINT "planned_blocks_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "work_moments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_modules" ADD CONSTRAINT "company_modules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

