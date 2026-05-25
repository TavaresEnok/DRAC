import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CamerasService } from '../cameras/cameras.service';
import { AiService } from './ai.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { MediamtxProxyService } from '../camera-stream/mediamtx-proxy.service';
import { buildRtspUrl, isHevcCodec, resolveDeliveryRtspProfile, resolveDeliveryVideoCodec } from '../cameras/helpers/rtsp-url.helper';

const AI_MODES = ['motion', 'face', 'general'] as const;
type AiMode = typeof AI_MODES[number];

@Injectable()
export class AiManagerService implements OnModuleInit {
  private readonly logger = new Logger(AiManagerService.name);
  private syncInFlight: Promise<any> | null = null;

  constructor(
    private readonly camerasService: CamerasService,
    private readonly aiService: AiService,
    private readonly cryptoService: CryptoService,
    private readonly prisma: PrismaService,
    private readonly mediamtxProxyService: MediamtxProxyService,
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
      const enabledCameras = cameras.filter((cam: any) => cam.aiEnabled !== false);
      const runtimeMode = settings.mode === 'motion' ? 'motion' : `motion+${settings.mode}`;
      this.logger.log(`Iniciando IA modo '${runtimeMode}' para ${enabledCameras.length}/${cameras.length} câmeras...`);
      await this.aiService.stopAll().catch(() => undefined);
      await this.aiService.resetModels().catch(() => undefined);
      let started = 0;
      
      for (const cam of enabledCameras) {
        try {
          const rtspUrl = await this.buildAiRtspUrl(cam, settings.mode);
          await this.aiService.startAnalysisWithConfig(cam.id, rtspUrl, settings.mode);
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
    if (cam.aiEnabled === false) {
      return { status: 'camera_disabled', cameraId };
    }
    const rtspUrl = await this.buildAiRtspUrl(cam, settings.mode);
    return this.aiService.startAnalysisWithConfig(cameraId, rtspUrl, settings.mode);
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

  private async buildAiRtspUrl(cam: any, mode = 'motion'): Promise<string> {
    const preferMediaMtx = String(process.env.AI_USE_MEDIAMTX ?? 'false').trim().toLowerCase() === 'true';
    const browserDeliveryRequiresTranscode = isHevcCodec(resolveDeliveryVideoCodec(cam));
    if (preferMediaMtx && this.mediamtxProxyService.isEnabled() && !browserDeliveryRequiresTranscode) {
      try {
        const ensured = await this.mediamtxProxyService.ensurePathForCamera(cam.id);
        const internalUrl = this.mediamtxProxyService.buildInternalRtspUrl(ensured.pathName);
        if (internalUrl) {
          this.logger.debug(`IA usando restream interno MediaMTX para ${cam.name}: ${internalUrl}`);
          return internalUrl;
        }
      } catch (err: any) {
        this.logger.warn(`Falha ao preparar MediaMTX para IA em ${cam.name}; usando RTSP direto como fallback: ${err.message}`);
      }
    }
    if (preferMediaMtx && browserDeliveryRequiresTranscode) {
      this.logger.debug(`IA usando RTSP direto para ${cam.name}: evita transcode H.265 -> H.264 exclusivo do navegador.`);
    }

    const password = this.cryptoService.decrypt(cam.passwordEncrypted);
    return this.buildDirectRtspUrl(cam, password, mode);
  }

  private buildDirectRtspUrl(cam: any, password: string, mode = 'motion'): string {
    const rawSubtype = String(process.env.AI_RTSP_SUBTYPE ?? '').trim().toLowerCase();
    const configuredSubtype = rawSubtype === '' || rawSubtype === 'auto'
      ? Number.NaN
      : Number(rawSubtype);
    const advancedMode = mode === 'face' || mode === 'general';
    const streamProfile = String(process.env.AI_RTSP_STREAM_PROFILE ?? 'live').trim().toLowerCase();
    const useRecordingProfile = advancedMode && ['recording', 'record', 'main'].includes(streamProfile);
    const profile = useRecordingProfile
      ? {
          channel: Number.isFinite(Number(cam.recordingChannel)) ? Number(cam.recordingChannel) : cam.channel,
          subtype: Number.isFinite(Number(cam.recordingSubtype)) ? Number(cam.recordingSubtype) : cam.subtype,
        }
      : resolveDeliveryRtspProfile(cam);
    const subtype = Number.isFinite(configuredSubtype) && configuredSubtype >= 0
      ? configuredSubtype
      : profile.subtype;

    // A IA deve analisar o mesmo perfil de entrega da Live por padrão.
    // Isso evita decodificar o perfil original HEVC de gravação e mantém
    // frontend, MediaMTX e Python sincronizados.
    return buildRtspUrl({
      username: cam.username,
      password,
      ip: cam.ip,
      rtspPort: cam.rtspPort || 554,
      rtspPath: cam.rtspPath,
      channel: profile.channel,
      subtype,
    });
  }

}
