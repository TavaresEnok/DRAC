import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CamerasService } from '../cameras/cameras.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { buildRtspUrl, resolveRecordingRtspProfile } from '../cameras/helpers/rtsp-url.helper';

type ClipState = {
  clipId: string;
  cameraId: string;
  userId: string;
  filePath: string;
  proc: ChildProcess;
  startedAt: number;
  stderrTail: string;
  exited: boolean;
  exitCode: number | null;
  autoStop: NodeJS.Timeout;
};

/**
 * Gravação de CLIPE sob demanda (exato do start ao stop), para "gravar no
 * celular" no app. Diferente da gravação contínua por segmentos: aqui um ffmpeg
 * dedicado grava a câmera com `-c copy` (SEM transcode = baixa CPU) num arquivo
 * temporário; o stop finaliza o MP4 (parada graciosa via 'q' → moov/faststart
 * válidos) e o app baixa o arquivo. Travas: teto de duração, limite de clipes
 * simultâneos e faxina periódica (nunca deixa ffmpeg/arquivo órfão).
 */
@Injectable()
export class ClipCaptureService {
  private readonly logger = new Logger(ClipCaptureService.name);
  private readonly clips = new Map<string, ClipState>();
  private readonly dir = path.join(os.tmpdir(), 'drac-clips');
  private readonly maxMs: number;
  private readonly maxConcurrent: number;
  private readonly ttlMs = 15 * 60 * 1000; // arquivos abandonados somem em 15min
  private ffmpegOk: boolean | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly camerasService: CamerasService,
    private readonly cryptoService: CryptoService,
  ) {
    fs.mkdirSync(this.dir, { recursive: true });
    this.maxMs = Number(this.configService.get<number>('clipMaxSeconds') ?? 300) * 1000; // 5min padrão
    this.maxConcurrent = Number(this.configService.get<number>('clipMaxConcurrent') ?? 3);
    setInterval(() => this.sweep(), 60_000).unref?.();
  }

  private checkFfmpeg(): boolean {
    if (this.ffmpegOk === null) this.ffmpegOk = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
    return this.ffmpegOk;
  }

  private activeCount(): number {
    let n = 0;
    for (const c of this.clips.values()) if (!c.exited) n += 1;
    return n;
  }

  async start(cameraId: string, userId: string): Promise<{ clipId: string }> {
    if (!this.checkFfmpeg()) throw new ServiceUnavailableException('FFmpeg não está instalado no servidor.');
    if (this.activeCount() >= this.maxConcurrent) {
      throw new ServiceUnavailableException('Muitas gravações de clipe em andamento. Tente novamente em instantes.');
    }
    const camera = await this.camerasService.getCameraOrThrow(cameraId);
    const password = this.cryptoService.decrypt(camera.passwordEncrypted);
    const profile = resolveRecordingRtspProfile(camera);
    const rtsp = buildRtspUrl({
      username: camera.username,
      password,
      ip: camera.ip,
      rtspPort: camera.rtspPort,
      rtspPath: camera.rtspPath ?? undefined,
      channel: profile.channel,
      subtype: profile.subtype,
    });
    const transport = camera.preferredRtspTransport ?? this.configService.get<string>('ffmpegRtspTransport') ?? 'tcp';
    const clipId = randomUUID();
    const filePath = path.join(this.dir, `${clipId}.mp4`);
    const maxSeconds = Math.ceil(this.maxMs / 1000);
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-rtsp_transport', transport,
      '-i', rtsp,
      '-t', String(maxSeconds), // teto de segurança (auto-encerra)
      // Vídeo → H.264 (yuv420p): compatível com QUALQUER celular/galeria. Câmeras
      // H.265/HEVC gravadas com `-c:v copy` geram MP4 que muitos players do celular
      // NÃO abrem (parâmetros VPS/SPS ausentes) — por isso o clipe "não tocava".
      // `veryfast` mantém a CPU baixa. Áudio → AAC (PCM/G.711 não entra em MP4).
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-f', 'mp4', '-y', filePath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    const state: ClipState = {
      clipId, cameraId, userId, filePath, proc,
      startedAt: Date.now(), stderrTail: '', exited: false, exitCode: null,
      autoStop: setTimeout(() => { void this.stop(clipId, userId).catch(() => undefined); }, this.maxMs + 2000),
    };
    proc.stderr?.on('data', (b: Buffer) => { state.stderrTail = (state.stderrTail + b.toString()).slice(-1000); });
    proc.on('close', (code) => { state.exited = true; state.exitCode = code; });
    proc.on('error', (e) => { state.exited = true; this.logger.error(`ffmpeg clip ${clipId}: ${e.message}`); });
    this.clips.set(clipId, state);
    this.logger.log(`clip start ${clipId} camera=${cameraId} user=${userId}`);
    return { clipId };
  }

  async stop(clipId: string, userId: string): Promise<{ ok: boolean; sizeBytes: number; durationMs: number }> {
    const st = this.clips.get(clipId);
    if (!st || st.userId !== userId) throw new NotFoundException('Clipe não encontrado.');
    clearTimeout(st.autoStop);
    if (!st.exited) {
      // Parada graciosa: 'q' faz o ffmpeg fechar o container (moov/faststart OK).
      try { st.proc.stdin?.write('q'); } catch { /* ignore */ }
      const closed = await this.waitExit(st, 8000);
      if (!closed) { try { st.proc.kill('SIGINT'); } catch { /* */ } await this.waitExit(st, 4000); }
      if (!st.exited) { try { st.proc.kill('SIGKILL'); } catch { /* */ } }
    }
    let sizeBytes = 0;
    try { sizeBytes = fs.statSync(st.filePath).size; } catch { /* */ }
    const durationMs = Date.now() - st.startedAt;
    if (sizeBytes <= 0) {
      this.cleanup(clipId);
      throw new BadRequestException(`Não foi possível gravar o clipe (câmera indisponível?). ${st.stderrTail.trim().slice(0, 200)}`);
    }
    return { ok: true, sizeBytes, durationMs };
  }

  private waitExit(st: ClipState, timeoutMs: number): Promise<boolean> {
    if (st.exited) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(st.exited), timeoutMs);
      st.proc.once('close', () => { clearTimeout(t); resolve(true); });
    });
  }

  /** Caminho do arquivo do clipe SE existir e for do usuário (para download). */
  getClipFile(clipId: string, userId: string): string {
    const st = this.clips.get(clipId);
    if (!st || st.userId !== userId || !fs.existsSync(st.filePath)) throw new NotFoundException('Clipe não encontrado.');
    return st.filePath;
  }

  cleanup(clipId: string) {
    const st = this.clips.get(clipId);
    if (!st) return;
    clearTimeout(st.autoStop);
    if (!st.exited) { try { st.proc.kill('SIGKILL'); } catch { /* */ } }
    try { fs.rmSync(st.filePath, { force: true }); } catch { /* */ }
    this.clips.delete(clipId);
  }

  private sweep() {
    const now = Date.now();
    for (const [id, st] of this.clips) {
      if (now - st.startedAt > this.ttlMs) this.cleanup(id);
    }
  }
}
