-- Remove possíveis duplicidades antes do unique
DELETE FROM "Recording" a
USING "Recording" b
WHERE a.ctid < b.ctid
  AND a."filePath" = b."filePath";

CREATE UNIQUE INDEX IF NOT EXISTS "Recording_filePath_key" ON "Recording"("filePath");
CREATE INDEX IF NOT EXISTS "Recording_cameraId_startedAt_idx" ON "Recording"("cameraId", "startedAt");
CREATE INDEX IF NOT EXISTS "Recording_startedAt_idx" ON "Recording"("startedAt");
