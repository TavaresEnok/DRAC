import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const RECORDING_MODES = ['continuous', 'motion', 'schedule', 'manual'] as const;
const VIDEO_CODECS = ['h264', 'h265', 'hevc', 'mjpeg'] as const;
const RTSP_TRANSPORTS = ['tcp', 'udp'] as const;
const LIVE_PROTOCOLS = ['flv', 'hls', 'webrtc', 'mjpeg'] as const;

export class UpdateCameraDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  ip?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rtspPort?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  onvifPort?: number;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  rtspPath?: string;

  @IsOptional()
  @IsString()
  onvifPath?: string;

  @IsOptional()
  @IsString()
  onvifProfileToken?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  channel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  subtype?: number;

  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(RECORDING_MODES)
  recordingMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;

  @IsOptional()
  @IsString()
  @IsIn(RTSP_TRANSPORTS)
  preferredRtspTransport?: string;

  @IsOptional()
  @IsString()
  @IsIn(LIVE_PROTOCOLS)
  preferredLiveProtocol?: string;

  @IsOptional()
  @IsString()
  @IsIn(VIDEO_CODECS)
  streamVideoCodec?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  streamWidth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  streamHeight?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  streamFps?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  streamBitrateKbps?: number;

  @IsOptional()
  @IsString()
  @IsIn(VIDEO_CODECS)
  recordingVideoCodec?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  recordingWidth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  recordingHeight?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  recordingFps?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  recordingBitrateKbps?: number;

  @IsOptional()
  @IsBoolean()
  audioEnabled?: boolean;
}
