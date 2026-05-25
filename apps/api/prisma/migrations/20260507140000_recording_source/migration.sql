-- CreateEnum
CREATE TYPE "RecordingSource" AS ENUM ('UNKNOWN', 'LOCAL', 'WORKER');

-- AlterTable
ALTER TABLE "Recording" ADD COLUMN "source" "RecordingSource" NOT NULL DEFAULT 'UNKNOWN';
