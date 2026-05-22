export type Direction = 'Up' | 'Down' | 'Left' | 'Right' | 'ZoomIn' | 'ZoomOut';
export type Tab = 'dashboard' | 'live' | 'grid' | 'playback' | 'profile';
export type IconName = 'home' | 'grid' | 'user' | 'settings' | 'camera' | 'mic' | 'video' | 'chevronLeft' | 'plus' | 'bell' | 'move' | 'play' | 'download' | 'calendar';

export type MosaicArea = {
  id: string;
  name: string;
  cameraIds: string[];
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
};

export type Camera = {
  id: string;
  name: string;
  ip: string;
  status: string;
  group?: { id: string; name: string } | null;
  canView?: boolean;
  canControl?: boolean;
  canRecord?: boolean;
  ptzCapable?: boolean;
  preferredLiveProtocol?: string;
  detectedWidth?: number | null;
  detectedHeight?: number | null;
  detectedFps?: number | null;
};

export type Recording = {
  id: string;
  cameraId: string;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  sizeBytes?: string | number | null;
  fileUsable?: boolean;
  fileExists?: boolean;
};

export type ActivePlayback = {
  recording: Recording;
  url: string;
};

export type StreamUrls = {
  streamToken?: string;
  protocols?: {
    hlsUrl?: string | null;
    webrtcUrl?: string | null;
    flvUrl?: string | null;
    posterUrl?: string | null;
  };
};

export type RelayDiscovery = {
  ok: boolean;
  relays?: Array<{ token: string }>;
  relayCount?: number;
  triggerable?: boolean;
  message?: string;
};

export type Session = {
  apiUrl: string;
  token: string;
  user: User;
};
