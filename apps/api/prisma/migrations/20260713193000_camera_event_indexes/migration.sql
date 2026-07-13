CREATE INDEX IF NOT EXISTS "CameraEvent_cameraId_type_occurredAt_idx"
ON "CameraEvent"("cameraId", "type", "occurredAt");

CREATE INDEX IF NOT EXISTS "CameraEvent_occurredAt_idx"
ON "CameraEvent"("occurredAt");
