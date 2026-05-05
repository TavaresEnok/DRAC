ALTER TABLE "AlarmRule"
  ADD COLUMN "notifyOnOpen" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "webhookUrl" TEXT,
  ADD COLUMN "emailTo" TEXT;
