import { join } from 'node:path';

export function buildRecordingOutputDir(recordingsRoot: string, cameraId: string, date = new Date()): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return join(recordingsRoot, `camera-${cameraId}`, year, month, day, hour);
}

export function buildRecordingOutputPattern(outputDir: string, format: string): string {
  return join(outputDir, `%Y-%m-%d_%H-%M-%S.${format}`);
}
