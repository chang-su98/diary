-- CreateTable
CREATE TABLE "notify_throttles" (
    "key" TEXT NOT NULL,
    "lastNotifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notify_throttles_pkey" PRIMARY KEY ("key")
);
