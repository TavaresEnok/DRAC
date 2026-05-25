ALTER TABLE "AiSettings" DROP COLUMN IF EXISTS "maxProcessors";
ALTER TABLE "Camera" ALTER COLUMN "preferredLiveProtocol" SET DEFAULT 'auto';
