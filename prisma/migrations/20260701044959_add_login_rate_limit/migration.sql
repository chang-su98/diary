-- CreateTable
CREATE TABLE "login_rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_rate_limits_pkey" PRIMARY KEY ("key")
);
