import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CamerasService } from '../cameras/cameras.service';
import { AiService } from './ai.service';
import { CryptoService } from '../common/crypto/crypto.service';

@Injectable()
export class AiManagerService implements OnModuleInit {
  private readonly logger = new Logger(AiManagerService.name);

  constructor(
    private readonly camerasService: CamerasService,
    private readonly aiService: AiService,
    private readonly cryptoService: CryptoService,
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
      const cameras = await this.camerasService.findAllInternal();
      this.logger.log(`Iniciando análise de IA para ${cameras.length} câmeras...`);
      
      for (const cam of cameras) {
        try {
          const password = this.cryptoService.decrypt(cam.passwordEncrypted);
          const rtspUrl = this.buildRtspUrl(cam, password);
          await this.aiService.startAnalysis(cam.id, rtspUrl);
          this.logger.log(`IA iniciada para câmera: ${cam.name}`);
        } catch (err: any) {
          this.logger.warn(`Falha ao iniciar IA para ${cam.name}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Erro ao sincronizar IA: ${err.message}`);
    }
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
