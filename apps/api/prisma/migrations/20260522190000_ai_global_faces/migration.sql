ALTER TABLE "Camera" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "AiSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "mode" TEXT NOT NULL DEFAULT 'motion',
  "fps" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AiSettings" ("id", "enabled", "mode", "fps", "updatedAt")
VALUES ('global', true, 'motion', 2, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "Person" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "externalId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FaceEmbedding" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "embedding" JSONB NOT NULL,
  "sourceImagePath" TEXT,
  "detScore" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FaceEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Person_isActive_idx" ON "Person"("isActive");
CREATE INDEX "Person_name_idx" ON "Person"("name");
CREATE INDEX "FaceEmbedding_personId_idx" ON "FaceEmbedding"("personId");

ALTER TABLE "FaceEmbedding"
  ADD CONSTRAINT "FaceEmbedding_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
