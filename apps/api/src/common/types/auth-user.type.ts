import { UserRole } from '@prisma/client';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type JwtAuthPayload = {
  sub: string;
  email: string;
  role: UserRole;
  ver: number;
  type: 'access';
};

export type StreamTokenPayload = {
  sub: string;
  cameraId: string;
  type: 'stream';
};

export type PlayTokenPayload = {
  sub: string;
  recordingId: string;
  type: 'play';
};

export type DownloadZipTokenPayload = {
  sub: string;
  recordingIds: string[];
  type: 'download-zip';
};
