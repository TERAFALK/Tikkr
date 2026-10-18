-- CreateTable
CREATE TABLE "login_throttles" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_throttles_until_idx" ON "login_throttles"("until");

-- CreateIndex
CREATE UNIQUE INDEX "login_throttles_scope_key_hash_key" ON "login_throttles"("scope", "key_hash");

