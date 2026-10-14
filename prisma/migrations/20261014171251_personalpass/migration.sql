-- CreateTable
CREATE TABLE "staff_blocks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "moment_id" TEXT NOT NULL,
    "planned_block_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "created_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_blocks_company_id_employee_id_starts_at_idx" ON "staff_blocks"("company_id", "employee_id", "starts_at");

-- CreateIndex
CREATE INDEX "staff_blocks_company_id_order_id_idx" ON "staff_blocks"("company_id", "order_id");

-- CreateIndex
CREATE INDEX "staff_blocks_company_id_starts_at_idx" ON "staff_blocks"("company_id", "starts_at");

-- CreateIndex
CREATE INDEX "staff_blocks_planned_block_id_idx" ON "staff_blocks"("planned_block_id");

-- AddForeignKey
ALTER TABLE "staff_blocks" ADD CONSTRAINT "staff_blocks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_blocks" ADD CONSTRAINT "staff_blocks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_blocks" ADD CONSTRAINT "staff_blocks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_blocks" ADD CONSTRAINT "staff_blocks_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "work_moments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_blocks" ADD CONSTRAINT "staff_blocks_planned_block_id_fkey" FOREIGN KEY ("planned_block_id") REFERENCES "planned_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

