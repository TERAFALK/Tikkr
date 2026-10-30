-- Fel och förslag förenklas (2026-10-11): inga svar till kunden, ingen prick
-- i menyn, och Ny/Pågår/Klar blir inkorg eller arkiv. Ingen version med de
-- gamla kolumnerna har släppts, så bara labbet berörs.
--
-- Att backa: svaren och "Pågår" går förlorade och kommer inte tillbaka. Ett
-- meddelande som var Klar flyttas till arkivet med en anteckning om det.

-- AlterTable
ALTER TABLE "feedback_messages" ADD COLUMN     "done_at" TIMESTAMP(3),
ADD COLUMN     "done_by_email" TEXT,
ADD COLUMN     "done_note" TEXT;

-- Det som redan var klart hamnar i arkivet, inte tillbaka i inkorgen.
UPDATE "feedback_messages"
SET "done_at" = COALESCE("status_changed_at", "created_at"),
    "done_by_email" = "status_changed_by_email",
    "done_note" = 'Klarmarkerad före arkivet.'
WHERE "status" = 'DONE';

-- DropForeignKey
ALTER TABLE "feedback_replies" DROP CONSTRAINT "feedback_replies_company_id_fkey";

-- DropForeignKey
ALTER TABLE "feedback_replies" DROP CONSTRAINT "feedback_replies_message_id_fkey";

-- DropIndex
DROP INDEX "feedback_messages_status_created_at_idx";

-- AlterTable
ALTER TABLE "admin_users" DROP COLUMN "support_seen_at";

-- AlterTable
ALTER TABLE "feedback_messages" DROP COLUMN "customer_updated_at",
DROP COLUMN "status",
DROP COLUMN "status_changed_at",
DROP COLUMN "status_changed_by_email";

-- DropTable
DROP TABLE "feedback_replies";

-- DropEnum
DROP TYPE "FeedbackStatus";

-- CreateIndex
CREATE INDEX "feedback_messages_done_at_created_at_idx" ON "feedback_messages"("done_at", "created_at");
