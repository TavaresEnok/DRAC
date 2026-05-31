import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CamerasService } from '../cameras/cameras.service';
import { AiService } from './ai.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  buildRtspUrl,
  isHevcCodec,
  resolveAnalyticsRtspProfile,
  resolveLiveRtspProfile,
  resolveRecordingRtspProfile,
  sanitizeRtspUrl,
} from '../cameras/helpers/rtsp-url.helper';
import { MediamtxProxyService } from '../camera-stream/mediamtx-proxy.service';

const AI_MODES = ['motion', 'face', 'general'] as const;
type AiMode = typeof AI_MODES[number];

function normalizeAiCameraToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-');
}

function parseAiCameraSet(raw: string | undefined): Set<string> {
  return new Set(
    String(raw ?? '')
      .split(',')
      .map((item) => normalizeAiCameraToken(item))
      .filter(Boolean),
  );
}

function cameraMatchesAiToken(cam: any, token: string): boolean {
  if (!token) return false;
  return [cam.id, cam.name, cam.slug, cam.displayName]
    .map((value) => normalizeAiCameraToken(value))
    .filter(Boolean)
    .includes(token);
}

function isCameraAllowedByAiEnv(cam: any): boolean {
  const forceSingle = String(process.env.AI_FORCE_SINGLE_CAMERA ?? 'false').trim().toLowerCase();
  const singleEnabled = ['1', 'true', 'yes', 'on'].includes(forceSingle);
  const singleId = normalizeAiCameraToken(process.env.AI_SINGLE_CAMERA_ID);
  if (singleEnabled && singleId) {
    return cameraMatchesAiToken(cam, singleId);
  }

  const configured = [
    process.env.AI_ENABLED_CAMERA_IDS,
    process.env.AI_ACTIVE_CAMERA_IDS,
    process.env.AI_ANALYTICS_CAMERA_IDS,
  ].filter((value) => String(value ?? '').trim().length > 0);
  if (!configured.length) return true;

  const allowed = new Set<string>();
  for (const raw of configured) {
    for (const token of parseAiCameraSet(raw)) allowed.add(token);
  }
  return Array.from(allowed).some((token) => cameraMatchesAiToken(cam, token));
}

@Injectable()
export class AiManagerService implements OnModuleInit {
  private readonly logger = new Logger(AiManagerService.name);
  private syncInFlight: Promise<any> | null = null;

  constructor(
    private readonly camerasService: CamerasService,
    private readonly aiService: AiService,
    private readonly cryptoService: CryptoService,
    private readonly prisma: PrismaService,
    private readonly mediamtxProxy: MediamtxProxyService,
  ) {}

  async onModuleInit() {
    if (String(process.env.AI_AUTO_START_ENABLED ?? 'true') === 'false') {
      this.logger.log('Sincronização automática de IA desativada por AI_AUTO_START_ENABLED=false.');
      return;
    }
    this.logger.log('Sincronizando IA com as câmeras...');
    // Aguarda um pouco para os serviços estarem prontos
    setTimeout(() => void this.syncAll(), 5000);
  }

  async syncAll() {
    if (this.syncInFlight) {
      this.logger.debug('Sincronização de IA já em execução; reutilizando operação atual.');
      return this.syncInFlight;
    }
    this.syncInFlight = this.performSyncAll();
    try {
      return await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async performSyncAll() {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) {
        this.logger.log('IA global desativada. Parando processadores ativos.');
        await this.aiService.stopAll().catch(() => undefined);
        return { started: 0, skipped: 'disabled', settings };
      }

      const cameras = await this.camerasService.findAllInternal();
      const enabledCameras = cameras.filter((cam: any) => cam.aiEnabled !== false && isCameraAllowedByAiEnv(cam));
      const runtimeMode = settings.mode === 'motion' ? 'motion' : `motion+${settings.mode}`;
      this.logger.log(`Iniciando IA modo '${runtimeMode}' para ${enabledCameras.length}/${cameras.length} câmeras...`);
      await this.aiService.stopAll().catch(() => undefined);
      await this.aiService.resetModels().catch(() => undefined);
      let started = 0;
      
      for (const cam of enabledCameras) {
        try {
          const source = await this.buildAiSource(cam);
          await this.aiService.startAnalysisWithConfig(cam.id, source.rtspUrl, settings.mode, source.info);
          started += 1;
          this.logger.log(`IA ${runtimeMode} iniciada para câmera: ${cam.name}`);
        } catch (err: any) {
          this.logger.warn(`Falha ao iniciar IA para ${cam.name}: ${err.message}`);
        }
      }
      return { started, settings };
    } catch (err: any) {
      this.logger.error(`Erro ao sincronizar IA: ${err.message}`);
      return { started: 0, error: err.message };
    }
  }

  async restartAll() {
    return this.syncAll();
  }

  async startCamera(cameraId: string) {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      return { status: 'disabled', cameraId };
    }
    const cam = await this.camerasService.getCameraOrThrow(cameraId);
    if (cam.aiEnabled === false || !isCameraAllowedByAiEnv(cam)) {
      return { status: 'camera_disabled', cameraId };
    }
    const source = await this.buildAiSource(cam);
    return this.aiService.startAnalysisWithConfig(cameraId, source.rtspUrl, settings.mode, source.info);
  }

  async getSettings() {
    return this.prisma.aiSettings.upsert({
      where: { id: 'global' },
      update: {},
      create: { id: 'global', enabled: true, mode: 'motion' },
    });
  }

  async updateSettings(input: { enabled?: boolean; mode?: string }) {
    const data: { enabled?: boolean; mode?: AiMode } = {};
    if (typeof input.enabled === 'boolean') data.enabled = input.enabled;
    if (input.mode !== undefined) {
      if (!AI_MODES.includes(input.mode as AiMode)) {
        throw new BadRequestException(`Modo de IA inválido: ${input.mode}`);
      }
      data.mode = input.mode as AiMode;
    }
    const settings = await this.prisma.aiSettings.upsert({
      where: { id: 'global' },
      update: data,
      create: {
        id: 'global',
        enabled: data.enabled ?? true,
        mode: data.mode ?? 'motion',
      },
    });
    const sync = await this.restartAll();
    return { settings, sync };
  }

  private async buildAiSource(cam: any): Promise<{ rtspUrl: string; info: Record<string, unknown> }> {
    const password = this.cryptoService.decrypt(cam.passwordEncrypted);
    const rawSubtype = String(process.env.AI_RTSP_SUBTYPE ?? '').trim().toLowerCase();
    const configuredSubtype = rawSubtype === '' || rawSubtype === 'auto'
      ? Number.NaN
      : Number(rawSubtype);
    const analyticsProfile = resolveAnalyticsRtspProfile(cam);
    const liveProfile = resolveLiveRtspProfile(cam);
    const recordingProfile = resolveRecordingRtspProfile(cam);
    const subtype = Number.isFinite(configuredSubtype) && configuredSubtype >= 0
      ? configuredSubtype
      : analyticsProfile.subtype;
    const channel = analyticsProfile.channel;

    const rtspUrl = buildRtspUrl({
      username: cam.username,
      password,
      ip: cam.ip,
      rtspPort: cam.rtspPort || 554,
      rtspPath: cam.rtspPath,
      channel,
      subtype,
    });
    const sourceUrlSanitized = sanitizeRtspUrl(rtspUrl);
    const infoBase = {
      recordSubtype: recordingProfile.subtype,
      recordChannel: recordingProfile.channel,
      liveSubtype: liveProfile.subtype,
      liveChannel: liveProfile.channel,
      analyticsSubtype: subtype,
      analyticsChannel: channel,
      configuredAnalyticsSubtype: cam.analyticsSubtype ?? null,
      configuredAnalyticsChannel: cam.analyticsChannel ?? null,
    };

    const rtspTransport = cam.preferredRtspTransport || process.env.FFMPEG_RTSP_TRANSPORT || 'tcp';
    const analyticsCodec = await this.mediamtxProxy.probeStreamVideoCodec(rtspUrl, rtspTransport).catch(() => null);
    const analyticsIsHevc = isHevcCodec(analyticsCodec);
    const hevcFallbackEnabled = String(process.env.AI_ANALYTICS_HEVC_FALLBACK ?? 'true').toLowerCase() !== 'false';

    if (analyticsIsHevc && hevcFallbackEnabled) {
      const fallback = await this.mediamtxProxy.ensurePathForCamera(cam.id);
      const fallbackRtspUrl = this.mediamtxProxy.buildInternalRtspUrl(fallback.pathName);
      if (fallbackRtspUrl) {
        this.logger.warn(`IA analytics de ${cam.name} esta em HEVC (${analyticsCodec}); usando path H.264 existente do MediaMTX: ${fallback.pathName}`);
        return {
          rtspUrl: fallbackRtspUrl,
          info: {
            ...infoBase,
            sourceKind: 'mediamtx_delivery_h264_fallback',
            usesMediaMtx: true,
            audioRequested: false,
            analyticsRtspUrl: fallbackRtspUrl,
            analyticsSourceUrlSanitized: sourceUrlSanitized,
            analyticsOriginalRtspUrl: sourceUrlSanitized,
            analyticsSourceCodec: analyticsCodec,
            analyticsTranscodedForAi: Boolean(fallback.transcodedForLive),
            analyticsMediaMtxPath: fallback.pathName,
            analyticsFallbackReason: 'hevc_direct_capture_unstable',
          },
        };
      }
    }

    this.logger.debug(`IA usando RTSP direto analytics para ${cam.name}: ${sourceUrlSanitized}${analyticsCodec ? ` codec=${analyticsCodec}` : ''}`);
    return {
      rtspUrl,
      info: {
        ...infoBase,
        sourceKind: 'direct_camera',
        usesMediaMtx: false,
        audioRequested: false,
        analyticsRtspUrl: sourceUrlSanitized,
        analyticsSourceUrlSanitized: sourceUrlSanitized,
        analyticsSourceCodec: analyticsCodec,
        analyticsTranscodedForAi: false,
      },
    };
  }

}
