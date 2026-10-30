-- CreateEnum
CREATE TYPE "PlanningMode" AS ENUM ('PRODUCTION', 'SERVICE');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "planning_mode" "PlanningMode" NOT NULL DEFAULT 'PRODUCTION';

