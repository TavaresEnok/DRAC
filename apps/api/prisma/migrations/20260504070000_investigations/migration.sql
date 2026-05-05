-- CreateTable
CREATE TABLE "Investigation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "summary" TEXT,
    "selectedCameraIds" JSONB NOT NULL,
    "timeStart" TIMESTAMP(3) NOT NULL,
    "timeEnd" TIMESTAMP(3) NOT NULL,
    "playbackSpeed" TEXT NOT NULL DEFAULT '1x',
    "activeTrackTime" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdByUserName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Investigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestigationItem" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cameraId" TEXT,
    "cameraName" TEXT,
    "eventId" TEXT,
    "recordingId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvestigationItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Investigation_createdAt_idx" ON "Investigation"("createdAt");
CREATE INDEX "Investigation_updatedAt_idx" ON "Investigation"("updatedAt");
CREATE INDEX "Investigation_status_idx" ON "Investigation"("status");
CREATE INDEX "InvestigationItem_investigationId_timestamp_idx" ON "InvestigationItem"("investigationId", "timestamp");
CREATE INDEX "InvestigationItem_cameraId_idx" ON "InvestigationItem"("cameraId");
CREATE INDEX "InvestigationItem_eventId_idx" ON "InvestigationItem"("eventId");
CREATE INDEX "InvestigationItem_recordingId_idx" ON "InvestigationItem"("recordingId");

ALTER TABLE "Investigation" ADD CONSTRAINT "Investigation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvestigationItem" ADD CONSTRAINT "InvestigationItem_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
