-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "atf_agreement" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "atf_work_form" TEXT;

-- AlterTable
ALTER TABLE "absence_reasons" ADD COLUMN     "gives_atf" BOOLEAN NOT NULL DEFAULT false;

