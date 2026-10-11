-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('BUG', 'SUGGESTION', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "support_seen_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "feedback_messages" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "author_user_id" TEXT,
    "author_email" TEXT NOT NULL,
    "author_name" TEXT,
    "kind" "FeedbackKind" NOT NULL,
    "area" TEXT,
    "page" TEXT,
    "body" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "status_changed_at" TIMESTAMP(3),
    "status_changed_by_email" TEXT,
    "customer_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_replies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_messages_company_id_created_at_idx" ON "feedback_messages"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "feedback_messages_status_created_at_idx" ON "feedback_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "feedback_messages_author_user_id_created_at_idx" ON "feedback_messages"("author_user_id", "created_at");

-- CreateIndex
CREATE INDEX "feedback_replies_message_id_created_at_idx" ON "feedback_replies"("message_id", "created_at");

-- CreateIndex
CREATE INDEX "feedback_replies_company_id_idx" ON "feedback_replies"("company_id");

-- AddForeignKey
ALTER TABLE "feedback_messages" ADD CONSTRAINT "feedback_messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_messages" ADD CONSTRAINT "feedback_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_replies" ADD CONSTRAINT "feedback_replies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_replies" ADD CONSTRAINT "feedback_replies_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "feedback_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

