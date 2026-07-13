import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { RecordingProcessManagerService } from '../recordings/recording-process-manager.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const onvif = require('onvif');

// Tópicos ONVIF que indicam que a PRÓPRIA câmera detecta movimento.
const MOTION_TOPIC_RE = /motion|cellmotion|motionalarm|videomotion|motiondetect/i;
// Eventos que significam FIM de movimento — não devem disparar gravação.
const MOTION_STOP_RE = /action=Stop|IsMotion=false|State=false/i;

/**
 * Detecção de movimento pela PRÓPRIA câmera (ONVIF).
 *
 * Duas responsabilidades:
 *  1) AUTO-PROBE: descobre quais câmeras publicam eventos de movimento ONVIF e
 *     ajusta `motionTrigger` sozinho — 'CAMERA' quando a câmera detecta (custo
 *     zero de CPU nossa) ou 'SYSTEM' quando não (cai na nossa MOG2 leve).
 *  2) GRAVAÇÃO DIRETA: para câmeras 'CAMERA' ARMADAS (recordingMode='motion'),
 *     um evento de movimento da câmera dispara a gravação na hora
 *     (handleMotionDetected → grava + agenda parada por post-roll).
 */
@Injectable()
export class OnvifEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnvifEventsService.name);
  private activeCams: Map<string, any> = new Map();
  private lastTriggerByCamera: Map<string, number> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private probeInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private isDisabled() {
    return String(process.env.AI_AUTO_START_ENABLED ?? 'true').trim().toLowerCase() === 'false';
  }

  async onModuleInit() {
    if (this.isDisabled()) return;
    this.logger.log('Inicializando daemon de eventos ONVIF...');
    // Escuta das câmeras 'CAMERA' (reavalia a cada 60s).
    this.pollInterval = setInterval(() => this.syncCameras(), 60000);
    setTimeout(() => this.syncCameras(), 5000);
    // Auto-probe: descobre suporte a movimento e ajusta motionTrigger.
    this.probeInterval = setInterval(() => this.probeAllCameras(), 15 * 60 * 1000);
    setTimeout(() => this.probeAllCameras(), 12000);
  }

  onModuleDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.probeInterval) clearInterval(this.probeInterval);
  }

  // ── AUTO-PROBE ─────────────────────────────────────────────────────────────
  /**
   * Sonda uma câmera via ONVIF e diz se ela publica eventos de movimento.
   * Retorna true (suporta), false (ONVIF ok, mas sem movimento) ou null
   * (inalcançável/sem porta — indeterminado, não mexe na config).
   */
  private probeMotionSupport(camera: any): Promise<boolean | null> {
    return new Promise((resolve) => {
      if (!camera.onvifPort) return resolve(null); // sem porta ONVIF → não dá pra sondar
      let settled = false;
      const finish = (v: boolean | null) => { if (!settled) { settled = true; resolve(v); } };
      const timer = setTimeout(() => finish(null), 6000);
      let password: string;
      try { password = this.cryptoService.decrypt(camera.passwordEncrypted); }
      catch { clearTimeout(timer); return finish(null); }
      try {
        const cam = new onvif.Cam(
          { hostname: camera.ip, username: camera.username, password, port: camera.onvifPort, timeout: 5000 },
          (err: any) => {
            if (settled) return;
            if (err) { clearTimeout(timer); return finish(null); }
            cam.getEventProperties((e2: any, data: any) => {
              if (settled) return;
              clearTimeout(timer);
              if (e2) return finish(false); // conectou mas sem serviço de eventos usável
              finish(MOTION_TOPIC_RE.test(JSON.stringify(data || {})));
            });
          },
        );
        cam.on('error', () => {});
      } catch { clearTimeout(timer); finish(null); }
    });
  }

  /**
   * Sonda todas as câmeras e ajusta motionTrigger automaticamente:
   *  - suporta movimento ONVIF  → 'CAMERA' (usa a detecção da câmera)
   *  - ONVIF ok mas sem movimento → 'SYSTEM' (nossa MOG2)
   *  - indeterminado (sem porta/inalcançável) → não altera (preserva a config)
   */
  private async probeAllCameras() {
    if (this.isDisabled()) return;
    try {
      const cameras = await this.prisma.camera.findMany({
        select: { id: true, name: true, ip: true, onvifPort: true, username: true, passwordEncrypted: true, motionTrigger: true },
      });
      for (const cam of cameras) {
        const supports = await this.probeMotionSupport(cam);
        if (supports === null) continue; // indeterminado → não mexe
        const target = supports ? 'CAMERA' : 'SYSTEM';
        if (cam.motionTrigger !== target) {
          await this.prisma.camera.update({ where: { id: cam.id }, data: { motionTrigger: target } });
          this.logger.log(`Auto-detecção de movimento: ${cam.name} → ${target} (ONVIF ${supports ? 'com' : 'sem'} movimento).`);
        }
      }
    } catch (error: any) {
      this.logger.warn(`Falha no auto-probe ONVIF: ${error.message}`);
    }
  }

  // ── ESCUTA + GRAVAÇÃO DIRETA ───────────────────────────────────────────────
  private async syncCameras() {
    if (this.isDisabled()) return;
    try {
      const cameras = await this.prisma.camera.findMany({ where: { motionTrigger: 'CAMERA' } });
      const currentIds = new Set(cameras.map((c) => c.id));
      for (const [id] of this.activeCams.entries()) {
        if (!currentIds.has(id)) {
          this.logger.log(`Removendo escuta ONVIF da câmera ${id}`);
          this.activeCams.delete(id);
        }
      }
      for (const c of cameras) {
        if (!this.activeCams.has(c.id)) this.connectCamera(c);
      }
    } catch (error: any) {
      this.logger.error(`Erro ao sincronizar câmeras ONVIF: ${error.message}`);
    }
  }

  private connectCamera(camera: any) {
    this.logger.log(`Conectando ONVIF na câmera ${camera.name} (${camera.ip})`);
    this.activeCams.set(camera.id, null); // marca p/ não reconectar em loop

    let password: string;
    try { password = this.cryptoService.decrypt(camera.passwordEncrypted); }
    catch { this.activeCams.delete(camera.id); return; }

    const cam = new onvif.Cam(
      { hostname: camera.ip, username: camera.username, password, port: camera.onvifPort || 80 },
      (err: any) => {
        if (err) {
          this.logger.warn(`Falha na conexão ONVIF com ${camera.name}: ${err.message}`);
          this.activeCams.delete(camera.id);
          return;
        }
        this.logger.log(`Conectado à câmera ${camera.name}, iniciando escuta de eventos...`);
        this.activeCams.set(camera.id, cam);

        cam.on('event', (camMessage: any) => {
          const str = JSON.stringify(camMessage);
          if (!MOTION_TOPIC_RE.test(str)) return; // não é evento de movimento
          if (MOTION_STOP_RE.test(str)) return;    // é FIM de movimento → ignora
          this.onCameraMotion(camera.id);
        });
      },
    );
    cam.on('error', () => {});
  }

  /**
   * Movimento reportado pela câmera → dispara a gravação DIRETO (se a câmera
   * estiver armada). handleMotionDetected checa recordingMode='motion', inicia
   * a gravação e agenda a parada por post-roll (60s após o último movimento) —
   * cada novo evento renova esse post-roll, então a gravação segue enquanto
   * houver movimento e para sozinha quando cessa. Cooldown evita enxurrada.
   */
  private onCameraMotion(cameraId: string) {
    const cooldownMs = Number(process.env.AI_ONVIF_TRIGGER_COOLDOWN_MS ?? 5000);
    const now = Date.now();
    if (now - (this.lastTriggerByCamera.get(cameraId) ?? 0) < cooldownMs) return;
    this.lastTriggerByCamera.set(cameraId, now);
    try {
      const recordingManager = this.moduleRef.get(RecordingProcessManagerService, { strict: false });
      void recordingManager.handleMotionDetected(cameraId, { source: 'onvif' }).catch(() => undefined);
    } catch {
      // recording manager indisponível — ignora (não derruba a escuta)
    }
  }
}
