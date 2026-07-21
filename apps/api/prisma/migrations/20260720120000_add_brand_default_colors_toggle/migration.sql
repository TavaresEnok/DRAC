INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
SELECT
  'brandUseDefaultColors',
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "SystemSetting"
      WHERE "key" LIKE 'brand%Color'
        AND BTRIM("value") <> ''
    ) THEN 'false'
    ELSE 'true'
  END,
  CURRENT_TIMESTAMP
ON CONFLICT ("key") DO NOTHING;
