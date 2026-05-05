-- CreateEnum
CREATE TYPE "CameraPermissionLevel" AS ENUM ('VIEW', 'CONTROL', 'RECORD', 'ADMIN');

-- AlterTable Camera
ALTER TABLE "Camera" ADD COLUMN "siteId" TEXT;
ALTER TABLE "Camera" ADD COLUMN "areaId" TEXT;
ALTER TABLE "Camera" ADD COLUMN "groupId" TEXT;

-- CreateTable
CREATE TABLE "Site" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Area" (
  "id" TEXT NOT NULL,
  "siteId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CameraGroup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CameraGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CameraPermission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cameraId" TEXT,
  "groupId" TEXT,
  "level" "CameraPermissionLevel" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CameraPermission_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "Site_name_idx" ON "Site"("name");
CREATE INDEX "Area_siteId_idx" ON "Area"("siteId");
CREATE INDEX "Area_name_idx" ON "Area"("name");
CREATE INDEX "CameraGroup_name_idx" ON "CameraGroup"("name");
CREATE INDEX "CameraPermission_userId_idx" ON "CameraPermission"("userId");
CREATE INDEX "CameraPermission_cameraId_idx" ON "CameraPermission"("cameraId");
CREATE INDEX "CameraPermission_groupId_idx" ON "CameraPermission"("groupId");
CREATE INDEX "Camera_siteId_idx" ON "Camera"("siteId");
CREATE INDEX "Camera_areaId_idx" ON "Camera"("areaId");
CREATE INDEX "Camera_groupId_idx" ON "Camera"("groupId");
CREATE INDEX "Camera_status_idx" ON "Camera"("status");

-- Foreign keys
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CameraGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Area" ADD CONSTRAINT "Area_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CameraPermission" ADD CONSTRAINT "CameraPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CameraPermission" ADD CONSTRAINT "CameraPermission_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CameraPermission" ADD CONSTRAINT "CameraPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CameraGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Validation constraint: camera XOR group
ALTER TABLE "CameraPermission"
ADD CONSTRAINT "CameraPermission_camera_or_group_check"
CHECK (("cameraId" IS NOT NULL AND "groupId" IS NULL) OR ("cameraId" IS NULL AND "groupId" IS NOT NULL));
