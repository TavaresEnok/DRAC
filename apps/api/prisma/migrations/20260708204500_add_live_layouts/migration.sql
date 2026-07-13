CREATE TABLE "LiveLayout" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "gridSize" TEXT NOT NULL,
  "cameraIds" JSONB NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LiveLayout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LiveLayout_userId_updatedAt_idx" ON "LiveLayout"("userId", "updatedAt");

ALTER TABLE "LiveLayout"
  ADD CONSTRAINT "LiveLayout_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
