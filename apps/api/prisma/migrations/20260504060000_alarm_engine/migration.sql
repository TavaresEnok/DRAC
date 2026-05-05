-- CreateEnum
CREATE TYPE "AlarmStatus" AS ENUM ('OPEN', 'ACKED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AlarmPriority" AS ENUM ('P1', 'P2', 'P3', 'P4');

-- CreateEnum
CREATE TYPE "AlarmSource" AS ENUM ('STREAM', 'HEALTH', 'MOTION', 'ANALYTICS', 'SYSTEM', 'MANUAL');

-- CreateTable
CREATE TABLE "AlarmRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "AlarmSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "priority" "AlarmPriority" NOT NULL DEFAULT 'P3',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dedupWindowSeconds" INTEGER NOT NULL DEFAULT 60,
    "autoResolveOnRecovery" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlarmRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlarmInstance" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT,
    "eventId" TEXT,
    "source" "AlarmSource" NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "priority" "AlarmPriority" NOT NULL,
    "status" "AlarmStatus" NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "note" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "firstOccurredAt" TIMESTAMP(3) NOT NULL,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "acknowledgedByUserName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedByUserName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlarmInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlarmRule_source_eventType_key" ON "AlarmRule"("source", "eventType");
CREATE INDEX "AlarmRule_isEnabled_idx" ON "AlarmRule"("isEnabled");
CREATE INDEX "AlarmRule_source_eventType_idx" ON "AlarmRule"("source", "eventType");
CREATE INDEX "AlarmInstance_cameraId_status_idx" ON "AlarmInstance"("cameraId", "status");
CREATE INDEX "AlarmInstance_status_priority_lastOccurredAt_idx" ON "AlarmInstance"("status", "priority", "lastOccurredAt");
CREATE INDEX "AlarmInstance_source_type_idx" ON "AlarmInstance"("source", "type");
CREATE INDEX "AlarmInstance_eventId_idx" ON "AlarmInstance"("eventId");

-- AddForeignKey
ALTER TABLE "AlarmInstance" ADD CONSTRAINT "AlarmInstance_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AlarmInstance" ADD CONSTRAINT "AlarmInstance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CameraEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
