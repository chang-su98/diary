-- CreateTable
CREATE TABLE "trips" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "authorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_places" (
    "id" SERIAL NOT NULL,
    "tripId" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_places_tripId_day_idx" ON "trip_places"("tripId", "day");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
