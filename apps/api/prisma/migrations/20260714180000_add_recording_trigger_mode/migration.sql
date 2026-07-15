ALTER TABLE "Recording"
ADD COLUMN "triggerMode" TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX "Recording_triggerMode_startedAt_idx"
ON "Recording"("triggerMode", "startedAt");
