import type { Recording } from '../types';

export type PlaybackFilter = 'all' | 'motion' | 'continuous' | 'unavailable';

export function recordingKind(recording: Recording): 'motion' | 'continuous' | 'unknown' {
  const mode = recording.triggerMode?.toLowerCase() ?? '';
  if (mode.includes('motion')) return 'motion';
  if (mode.includes('continuous')) return 'continuous';
  return 'unknown';
}

export function matchesPlaybackFilter(recording: Recording, filter: PlaybackFilter): boolean {
  const unavailable = recording.fileUsable === false || recording.fileExists === false;
  if (filter === 'all') return true;
  if (filter === 'unavailable') return unavailable;
  return !unavailable && recordingKind(recording) === filter;
}

export function timelineRange(recording: Recording): { left: number; width: number } {
  const start = new Date(recording.startedAt);
  const seconds = start.getHours() * 3600 + start.getMinutes() * 60 + start.getSeconds();
  const rawDuration = recording.durationSeconds
    ?? (recording.endedAt ? Math.max(1, (new Date(recording.endedAt).getTime() - start.getTime()) / 1000) : 1);
  const left = Math.max(0, Math.min(100, (seconds / 86400) * 100));
  const width = Math.max(0.45, Math.min(100 - left, (Math.max(1, rawDuration) / 86400) * 100));
  return { left, width };
}
