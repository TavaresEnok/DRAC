INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
VALUES ('requireStrongPassword', 'true', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "value" = 'true', "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "AlarmRule"
SET "dedupWindowSeconds" = GREATEST("dedupWindowSeconds", 300),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "source" = 'MOTION' AND "eventType" = 'MOTION_DETECTED';
