-- CreateTable
CREATE TABLE "staff_days" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_breaks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "staff_day_id" TEXT NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_days_company_id_employee_id_idx" ON "staff_days"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "staff_breaks_company_id_staff_day_id_idx" ON "staff_breaks"("company_id", "staff_day_id");

-- AddForeignKey
ALTER TABLE "staff_days" ADD CONSTRAINT "staff_days_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_days" ADD CONSTRAINT "staff_days_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_breaks" ADD CONSTRAINT "staff_breaks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_breaks" ADD CONSTRAINT "staff_breaks_staff_day_id_fkey" FOREIGN KEY ("staff_day_id") REFERENCES "staff_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

