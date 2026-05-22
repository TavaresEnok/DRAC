import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CamerasService } from '../cameras/cameras.service';
import { AiService } from './ai.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { PrismaService } from '../common/prisma/prisma.service';

const AI_MODES = ['motion', 'face', 'general', 'recognition'] as const;
type AiMode = typeof AI_MODES[number];

@Injectable()
export class AiManagerService implements OnModuleInit {
  private readonly logger = new Logger(AiManagerService.name);

  constructor(
    private readonly camerasService: CamerasService,
    private readonly aiService: AiService,
    private readonly cryptoService: CryptoService,
    private readonly prisma: PrismaService,
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
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) {
        this.logger.log('IA global desativada. Parando processadores ativos.');
        await this.aiService.stopAll().catch(() => undefined);
        return { started: 0, skipped: 'disabled', settings };
      }

      const cameras = await this.camerasService.findAllInternal();
      const enabledCameras = cameras.filter((cam: any) => cam.aiEnabled !== false);
      this.logger.log(`Iniciando IA modo '${settings.mode}' para ${enabledCameras.length}/${cameras.length} câmeras...`);
      await this.aiService.loadModel(settings.mode);
      let started = 0;
      
      for (const cam of enabledCameras) {
        try {
          const password = this.cryptoService.decrypt(cam.passwordEncrypted);
          const rtspUrl = this.buildRtspUrl(cam, password);
          await this.aiService.startAnalysis(cam.id, rtspUrl, settings.mode);
          started += 1;
          this.logger.log(`IA ${settings.mode} iniciada para câmera: ${cam.name}`);
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
    await this.aiService.stopAll().catch(() => undefined);
    await this.aiService.resetModels().catch(() => undefined);
    return this.syncAll();
  }

  async getSettings() {
    return this.prisma.aiSettings.upsert({
      where: { id: 'global' },
      update: {},
      create: { id: 'global', enabled: true, mode: 'motion', fps: Number(process.env.AI_PROCESS_FPS ?? 2) || 2 },
    });
  }

  async updateSettings(input: { enabled?: boolean; mode?: string; fps?: number }) {
    const data: { enabled?: boolean; mode?: AiMode; fps?: number } = {};
    if (typeof input.enabled === 'boolean') data.enabled = input.enabled;
    if (input.mode !== undefined) {
      if (!AI_MODES.includes(input.mode as AiMode)) {
        throw new BadRequestException(`Modo de IA inválido: ${input.mode}`);
      }
      data.mode = input.mode as AiMode;
    }
    if (input.fps !== undefined && Number.isFinite(Number(input.fps))) {
      data.fps = Math.max(0.2, Math.min(10, Number(input.fps)));
    }
    const settings = await this.prisma.aiSettings.upsert({
      where: { id: 'global' },
      update: data,
      create: {
        id: 'global',
        enabled: data.enabled ?? true,
        mode: data.mode ?? 'motion',
        fps: data.fps ?? (Number(process.env.AI_PROCESS_FPS ?? 2) || 2),
      },
    });
    const sync = await this.restartAll();
    return { settings, sync };
  }

  private buildRtspUrl(cam: any, password: string): string {
    const port = cam.rtspPort || 554;
    const configuredSubtype = Number(process.env.AI_RTSP_SUBTYPE ?? '1');
    const aiSubtype = Number.isFinite(configuredSubtype) && configuredSubtype >= 0 ? configuredSubtype : cam.subtype;
    let path = cam.rtspPath || `/Streaming/Channels/${cam.channel}${aiSubtype.toString().padStart(2, '0')}`;
    if (!path.startsWith('/')) path = '/' + path;

    if (Number.isFinite(aiSubtype)) {
      if (/[?&]subtype=\d+/i.test(path)) {
        path = path.replace(/([?&]subtype=)\d+/i, `$1${aiSubtype}`);
      } else {
        path = path.replace(
          /(\/Streaming\/Channels\/\d)\d{2}/i,
          (_match: string, prefix: string) => `${prefix}${aiSubtype.toString().padStart(2, '0')}`,
        );
      }
    }
    
    // URL format: rtsp://user:pass@ip:port/path
    return `rtsp://${cam.username}:${password}@${cam.ip}:${port}${path}`;
  }
}
