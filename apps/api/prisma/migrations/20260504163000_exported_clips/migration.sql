-- CreateTable
CREATE TABLE "ExportedClip" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "sourceRecordingId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "sizeBytes" BIGINT,
    "createdByUserId" TEXT,
    "createdByUserName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportedClip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExportedClip_filePath_key" ON "ExportedClip"("filePath");

-- CreateIndex
CREATE INDEX "ExportedClip_cameraId_startedAt_idx" ON "ExportedClip"("cameraId", "startedAt");

-- CreateIndex
CREATE INDEX "ExportedClip_sourceRecordingId_idx" ON "ExportedClip"("sourceRecordingId");

-- CreateIndex
CREATE INDEX "ExportedClip_createdAt_idx" ON "ExportedClip"("createdAt");

-- AddForeignKey
ALTER TABLE "ExportedClip" ADD CONSTRAINT "ExportedClip_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportedClip" ADD CONSTRAINT "ExportedClip_sourceRecordingId_fkey" FOREIGN KEY ("sourceRecordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
