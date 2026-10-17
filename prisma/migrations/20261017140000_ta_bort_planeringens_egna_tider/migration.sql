-- DropForeignKey
ALTER TABLE "staff_days" DROP CONSTRAINT "staff_days_company_id_fkey";

-- DropForeignKey
ALTER TABLE "staff_days" DROP CONSTRAINT "staff_days_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "staff_breaks" DROP CONSTRAINT "staff_breaks_company_id_fkey";

-- DropForeignKey
ALTER TABLE "staff_breaks" DROP CONSTRAINT "staff_breaks_staff_day_id_fkey";

-- DropTable
DROP TABLE "staff_days";

-- DropTable
DROP TABLE "staff_breaks";

