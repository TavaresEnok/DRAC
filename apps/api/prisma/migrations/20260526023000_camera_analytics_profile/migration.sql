ALTER TABLE "Camera"
  ADD COLUMN "analyticsChannel" INTEGER,
  ADD COLUMN "analyticsSubtype" INTEGER;

UPDATE "Camera"
SET
  "analyticsChannel" = COALESCE("analyticsChannel", "liveChannel", "channel", 1),
  "analyticsSubtype" = COALESCE("analyticsSubtype", 1);
