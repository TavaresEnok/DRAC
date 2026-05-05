-- CreateTable
CREATE TABLE "SiteMapLayout" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "floor" TEXT NOT NULL,
  "svgDataUrl" TEXT,
  "markers" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteMapLayout_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "SiteMapLayout_siteId_floor_key" ON "SiteMapLayout"("siteId", "floor");
CREATE INDEX "SiteMapLayout_siteId_idx" ON "SiteMapLayout"("siteId");
CREATE INDEX "SiteMapLayout_floor_idx" ON "SiteMapLayout"("floor");

-- Foreign key
ALTER TABLE "SiteMapLayout"
ADD CONSTRAINT "SiteMapLayout_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
