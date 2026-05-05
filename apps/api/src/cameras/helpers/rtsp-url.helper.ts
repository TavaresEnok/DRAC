export type CameraRtspUrlInput = {
  username: string;
  password: string;
  ip: string;
  rtspPort: number;
  rtspPath?: string | null;
  channel?: number | null;
  subtype?: number | null;
};

export function buildRtspUrl(camera: CameraRtspUrlInput): string {
  let rtspPath =
    camera.rtspPath && camera.rtspPath.trim().length > 0
      ? camera.rtspPath
      : `/cam/realmonitor?channel=${camera.channel ?? 1}&subtype=${camera.subtype ?? 0}`;

  if (!rtspPath.startsWith('/')) {
    rtspPath = '/' + rtspPath;
  }

  return `rtsp://${camera.username}:${camera.password}@${camera.ip}:${camera.rtspPort}${rtspPath}`;
}
