import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import axios from 'axios';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const onvif = require('onvif');

@Injectable()
export class OnvifEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnvifEventsService.name);
  private activeCams: Map<string, any> = new Map();
  private lastWakeupByCamera: Map<string, number> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  async onModuleInit() {
    this.logger.log('Inicializando daemon de eventos ONVIF...');
    // Inicia um loop a cada 60s para buscar novas câmeras que mudaram para "CAMERA"
    this.pollInterval = setInterval(() => this.syncCameras(), 60000);
    setTimeout(() => this.syncCameras(), 5000); // Executa depois que o servidor subir
  }

  onModuleDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private async syncCameras() {
    try {
      const cameras = await this.prisma.camera.findMany({
        where: { motionTrigger: 'CAMERA' }
      });

      const currentIds = new Set(cameras.map(c => c.id));

      // Remove as que não estão mais ativas
      for (const [id, cam] of this.activeCams.entries()) {
        if (!currentIds.has(id)) {
           this.logger.log(`Removendo escuta ONVIF da câmera ${id}`);
           this.activeCams.delete(id);
        }
      }

      // Adiciona novas
      for (const c of cameras) {
        if (!this.activeCams.has(c.id)) {
          this.connectCamera(c);
        }
      }
    } catch (error: any) {
      this.logger.error(`Erro ao sincronizar câmeras ONVIF: ${error.message}`);
    }
  }

  private connectCamera(camera: any) {
    this.logger.log(`Conectando ONVIF na câmera ${camera.name} (${camera.ip})`);

    // Marca como registrada para não tentar infinitamente no loop (se falhar, vai ficar null)
    this.activeCams.set(camera.id, null);

    const password = this.cryptoService.decrypt(camera.passwordEncrypted);

    const cam = new onvif.Cam({
      hostname: camera.ip,
      username: camera.username,
      password: password,
      port: camera.onvifPort || 80,
    }, (err: any) => {
      if (err) {
        this.logger.warn(`Falha na conexão ONVIF com ${camera.name}: ${err.message}`);
        this.activeCams.delete(camera.id); // Tenta de novo no próximo ciclo
        return;
      }

      this.logger.log(`Conectado à câmera ${camera.name}, iniciando escuta de eventos...`);
      this.activeCams.set(camera.id, cam);

      cam.on('event', (camMessage: any) => {
        // Lógica para disparar Wakeup
        const str = JSON.stringify(camMessage);

        // Filtrar apenas alarmes relevantes
        if (str.includes('MotionAlarm') || str.includes('PersonDetected') || str.includes('CrossLineDetector') || str.includes('IntrusionDetector') || str.includes('VideoMotion')) {
           // Checa se é 'action=Start' ou se não for VideoMotion, acorda mesmo assim
           if (str.includes('action=Stop') || str.includes('VideoMotion;action=Stop') || str.includes('IsMotion=false')) return;

           this.wakeUpCamera(camera.id);
        }
      });
    });
  }

  private wakeUpCamera(cameraId: string) {
    if (String(process.env.AI_AUTO_START_ENABLED ?? 'true').trim().toLowerCase() === 'false') return;

    const cooldownMs = Number(process.env.AI_ONVIF_WAKEUP_COOLDOWN_MS ?? 30000);
    const now = Date.now();
    const lastWakeup = this.lastWakeupByCamera.get(cameraId) ?? 0;
    if (now - lastWakeup < cooldownMs) return;
    this.lastWakeupByCamera.set(cameraId, now);

    // Evita encher o serviço Python de requests
    // O axios post simples com timeout baixo é ideal.
    axios.post(`http://vms-ai-service:8000/analyze/wakeup/${cameraId}?duration_seconds=20`, null, {
       headers: { 'x-service-token': process.env.INTERNAL_SERVICE_TOKEN },
       timeout: 2000
    }).catch((e) => {
       // Silencia os erros para não entupir o log
    });
  }
}
