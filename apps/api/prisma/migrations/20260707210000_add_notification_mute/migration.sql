-- CreateTable
CREATE TABLE "NotificationMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationMute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationMute_userId_cameraId_key" ON "NotificationMute"("userId", "cameraId");

-- CreateIndex
CREATE INDEX "NotificationMute_cameraId_idx" ON "NotificationMute"("cameraId");

-- AddForeignKey
ALTER TABLE "NotificationMute" ADD CONSTRAINT "NotificationMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationMute" ADD CONSTRAINT "NotificationMute_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;
