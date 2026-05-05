import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CameraStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as http from 'http';
import { spawn } from 'child_process';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { PortCheckerService } from '../common/network/port-checker.service';
import { AlarmsService } from '../alarms/alarms.service';
import { CreateCameraDto } from './dto/create-camera.dto';
import { TestCameraConnectionDto } from './dto/test-camera-connection.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';

export function sanitizeCamera<T extends { passwordEncrypted: string }>(camera: T): Omit<T, 'passwordEncrypted'> {
  const { passwordEncrypted, ...safeCamera } = camera;
  return safeCamera;
}

@Injectable()
export class CamerasService {
  private readonly logger = new Logger(CamerasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cryptoService: CryptoService,
    private readonly portChecker: PortCheckerService,
    private readonly alarmsService: AlarmsService,
  ) {}

  async create(dto: CreateCameraDto) {
    await this.validateReferences(dto.siteId, dto.areaId, dto.groupId);
    const camera = await this.prisma.camera.create({
      data: {
        name: dto.name,
        ip: dto.ip,
        rtspPort: dto.rtspPort,
        onvifPort: dto.onvifPort,
        username: dto.username,
        passwordEncrypted: this.cryptoService.encrypt(dto.password),
        rtspPath: dto.rtspPath,
        onvifPath: dto.onvifPath,
        onvifProfileToken: dto.onvifProfileToken,
        channel: dto.channel ?? 1,
        subtype: dto.subtype ?? 0,
        siteId: dto.siteId,
        areaId: dto.areaId,
        groupId: dto.groupId,
        recordingEnabled: dto.recordingEnabled ?? true,
      },
    });

    return sanitizeCamera(camera);
  }

  async findAll(accessibleIds?: string[]) {
    const cameras = await this.prisma.camera.findMany({
      where: accessibleIds ? { id: { in: accessibleIds } } : {},
      include: { site: true, area: true, group: true },
      orderBy: { createdAt: 'desc' },
    });
    return cameras.map(sanitizeCamera);
  }

  async findAllInternal() {
    return this.prisma.camera.findMany({
      include: { site: true, area: true, group: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const camera = await this.getCameraOrThrow(id);
    return sanitizeCamera(camera);
  }

  async update(id: string, dto: UpdateCameraDto) {
    const existing = await this.getCameraOrThrow(id);
    await this.validateReferences(dto.siteId, dto.areaId, dto.groupId);
    const camera = await this.prisma.camera.update({
      where: { id },
      data: {
        name: dto.name,
        ip: dto.ip,
        rtspPort: dto.rtspPort,
        onvifPort: dto.onvifPort,
        username: dto.username,
        passwordEncrypted: dto.password ? this.cryptoService.encrypt(dto.password) : existing.passwordEncrypted,
        rtspPath: dto.rtspPath,
        onvifPath: dto.onvifPath,
        onvifProfileToken: dto.onvifProfileToken,
        channel: dto.channel,
        subtype: dto.subtype,
        siteId: dto.siteId,
        areaId: dto.areaId,
        groupId: dto.groupId,
        recordingEnabled: dto.recordingEnabled !== undefined ? dto.recordingEnabled : existing.recordingEnabled,
      },
      include: { site: true, area: true, group: true },
    });

    return sanitizeCamera(camera);
  }

  async remove(id: string) {
    const camera = await this.getCameraOrThrow(id);
    return this.prisma.camera.delete({ where: { id } });
  }

  async updateStatus(id: string, status: CameraStatus, lastSeenAt?: string) {
    return this.prisma.camera.update({
      where: { id },
      data: {
        status,
        lastSeenAt: lastSeenAt ? new Date(lastSeenAt) : new Date(),
      },
    });
  }

  async registerEvent(id: string, type: string, severity: string, message: string, metadata?: any, occurredAt?: Date) {
    const event = await this.prisma.cameraEvent.create({
      data: {
        cameraId: id,
        type,
        severity,
        message,
        metadata: metadata ?? {},
        occurredAt: occurredAt ?? new Date(),
      },
    });
    await this.alarmsService.processEvent({
      eventId: event.id,
      cameraId: id,
      type,
      severity,
      message,
      metadata: metadata ?? {},
      occurredAt: event.occurredAt,
    });
    return event;
  }

  async testConnection(id: string) {
    const status = await this.getStatus(id);
    const refreshed = await this.getCameraOrThrow(id);
    return {
      camera: sanitizeCamera(refreshed),
      rtspReachable: status.rtspReachable,
      onvifReachable: status.onvifReachable,
      status: status.status,
    };
  }

  async testConnectionDraft(input: TestCameraConnectionDto) {
    const rtspPortCandidates = Array.from(
      new Set([input.rtspPort, 554, 8554, 10554, 5544, 51488, 51489, 51490].filter((v): v is number => Number.isFinite(v as number))),
    );
    const reachableRtspPorts: number[] = [];
    for (const port of rtspPortCandidates) {
      if (await this.portChecker.check(input.ip, port)) {
        reachableRtspPorts.push(port);
      }
    }
    const rtspReachable = reachableRtspPorts.includes(input.rtspPort);
    const rtspReachableAny = reachableRtspPorts.length > 0;
    const onvifPorts = Array.from(new Set([input.onvifPort, 8075, 8080, 8000, 8899, 80, 2020].filter((v): v is number => Number.isFinite(v as number))));
    const reachablePorts: number[] = [];
    for (const port of onvifPorts) {
      if (await this.portChecker.check(input.ip, port)) {
        reachablePorts.push(port);
      }
    }
    const onvifReachable = input.onvifPort == null ? reachablePorts.length > 0 : reachablePorts.includes(input.onvifPort);

    const rtspPathCandidates = Array.from(new Set([
      input.rtspPath?.trim().length ? input.rtspPath.trim() : null,
      input.channel != null && input.subtype != null ? `/cam/realmonitor?channel=${input.channel}&subtype=${input.subtype}` : null,
      '/cam/realmonitor?channel=1&subtype=0',
      '/cam/realmonitor?channel=1&subtype=1',
      '/cam/realmonitor?channel=1&subtype=0&unicast=true',
      '/cam/realmonitor?channel=1&subtype=1&unicast=true',
      '/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif',
      '/cam/realmonitor?channel=1&subtype=1&unicast=true&proto=Onvif',
      '/h264/ch1/main/av_stream',
      '/h264/ch1/sub/av_stream',
      '/live/ch00_0',
      '/live/ch00_1',
      '/Streaming/Channels/101',
      '/Streaming/Channels/102',
    ].filter((v): v is string => Boolean(v))));

    let rtspAuthOk = false;
    let selectedRtspPortAuthOk = false;
    let detectedRtspPort: number | null = null;
    let detectedRtspPath: string | null = null;
    let rtspProbeError: string | null = null;
    if (rtspReachableAny && input.username && input.password) {
      if (rtspReachable) {
        const selectedProbe = await this.probeRtspPaths({
          ip: input.ip,
          rtspPorts: [input.rtspPort],
          username: input.username,
          password: input.password,
          paths: rtspPathCandidates,
        });
        selectedRtspPortAuthOk = selectedProbe.ok;
      }
      const probe = await this.probeRtspPaths({
        ip: input.ip,
        rtspPorts: reachableRtspPorts,
        username: input.username,
        password: input.password,
        paths: rtspPathCandidates,
      });
      rtspAuthOk = probe.ok;
      detectedRtspPort = probe.port;
      detectedRtspPath = probe.path;
      rtspProbeError = probe.error;
    }

    let status: CameraStatus = CameraStatus.OFFLINE;
    if (rtspReachable && onvifReachable && (input.username ? selectedRtspPortAuthOk : true)) {
      status = CameraStatus.ONLINE;
    }

    const suggestedRtspPath = `/cam/realmonitor?channel=${input.channel ?? 1}&subtype=${input.subtype ?? 0}`;
    const candidatePaths = Array.from(new Set([input.onvifPath?.trim(), '/onvif/ptz_service', '/onvif/device_service'].filter((v): v is string => Boolean(v))));
    const candidateTokens = Array.from(new Set([input.onvifProfileToken?.trim(), 'Profile000', 'Profile001', 'profile_1'].filter((v): v is string => Boolean(v))));

    let detectedOnvifPort: number | null = null;
    let detectedOnvifPath: string | null = null;
    let detectedOnvifProfileToken: string | null = null;
    let ptzDigestOk = false;

    if (input.username && input.password && reachablePorts.length > 0) {
      for (const port of reachablePorts) {
        for (const path of candidatePaths) {
          for (const token of candidateTokens) {
            const ok = await this.tryOnvifDigestStop({
              host: input.ip,
              port,
              path,
              username: input.username,
              password: input.password,
              profileToken: token,
            });
            if (ok) {
              ptzDigestOk = true;
              detectedOnvifPort = port;
              detectedOnvifPath = path;
              detectedOnvifProfileToken = token;
              break;
            }
          }
          if (ptzDigestOk) break;
        }
        if (ptzDigestOk) break;
      }
    }

    return {
      ip: input.ip,
      rtspPort: input.rtspPort,
      onvifPort: input.onvifPort ?? null,
      rtspReachable,
      rtspReachableAny,
      reachableRtspPorts,
      onvifReachable,
      ptzDigestOk,
      reachableOnvifPorts: reachablePorts,
      suggestedRtspPath,
      rtspAuthOk,
      selectedRtspPortAuthOk,
      detectedRtspPort,
      detectedRtspPath,
      rtspProbeError,
      detectedOnvifPort,
      detectedOnvifPath,
      detectedOnvifProfileToken,
      status,
      checkedAt: new Date().toISOString(),
    };
  }

  private parseDigestHeader(header: string) {
    const result: Record<string, string> = {};
    const quotedRegex = /(\w+)="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = quotedRegex.exec(header)) !== null) {
      result[match[1]] = match[2];
    }
    return result;
  }

  private buildDigestAuthorization(
    method: string,
    uri: string,
    authHeader: string,
    username: string,
    password: string,
  ) {
    const params = this.parseDigestHeader(authHeader);
    const realm = params.realm ?? '';
    const nonce = params.nonce ?? '';
    const qop = params.qop ?? 'auth';
    const opaque = params.opaque ?? '';
    const cnonce = randomBytes(8).toString('hex');
    const ncStr = '00000001';
    const ha1 = createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
    const ha2 = createHash('md5').update(`${method}:${uri}`).digest('hex');
    const response = createHash('md5')
      .update(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop}:${ha2}`)
      .digest('hex');
    let auth = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${ncStr}, cnonce="${cnonce}", response="${response}"`;
    if (opaque) auth += `, opaque="${opaque}"`;
    return auth;
  }

  private buildOnvifStopBody(profileToken: string) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <soap:Body>
    <tptz:Stop>
      <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      <tptz:Zoom>true</tptz:Zoom>
    </tptz:Stop>
  </soap:Body>
</soap:Envelope>`;
  }

  private async tryOnvifDigestStop(input: {
    host: string;
    port: number;
    path: string;
    username: string;
    password: string;
    profileToken: string;
  }) {
    const body = this.buildOnvifStopBody(input.profileToken);
    const baseHeaders = {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      Connection: 'close',
    };

    return await new Promise<boolean>((resolve) => {
      const req1 = http.request(
        {
          host: input.host,
          port: input.port,
          path: input.path,
          method: 'POST',
          timeout: 3500,
          headers: baseHeaders,
        },
        (res1) => {
          const authHeader = res1.headers['www-authenticate'];
          if (res1.statusCode !== 401 || !authHeader || !String(authHeader).toLowerCase().startsWith('digest')) {
            resolve((res1.statusCode ?? 500) < 400);
            return;
          }

          const digestAuth = this.buildDigestAuthorization(
            'POST',
            input.path,
            String(authHeader),
            input.username,
            input.password,
          );
          const req2 = http.request(
            {
              host: input.host,
              port: input.port,
              path: input.path,
              method: 'POST',
              timeout: 3500,
              headers: { ...baseHeaders, Authorization: digestAuth },
            },
            (res2) => resolve((res2.statusCode ?? 500) < 400),
          );
          req2.on('error', () => resolve(false));
          req2.on('timeout', () => {
            req2.destroy();
            resolve(false);
          });
          req2.write(body);
          req2.end();
        },
      );

      req1.on('error', () => resolve(false));
      req1.on('timeout', () => {
        req1.destroy();
        resolve(false);
      });
      req1.write(body);
      req1.end();
    });
  }

  private async probeRtspPaths(input: {
    ip: string;
    rtspPorts: number[];
    username: string;
    password: string;
    paths: string[];
  }) {
    let lastError: string | null = null;
    for (const port of input.rtspPorts) {
      for (const path of input.paths) {
        const url = `rtsp://${encodeURIComponent(input.username)}:${encodeURIComponent(input.password)}@${input.ip}:${port}${path}`;
        const result = await new Promise<{ ok: boolean; error: string | null }>((resolve) => {
          const proc = spawn(
            'ffprobe',
            [
              '-v',
              'error',
              '-rtsp_transport',
              'tcp',
              '-timeout',
              '5000000',
              '-select_streams',
              'v:0',
              '-show_entries',
              'stream=codec_name,width,height',
              '-of',
              'default=nw=1',
              url,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
          );
          let settled = false;
          const finish = (value: { ok: boolean; error: string | null }) => {
            if (settled) return;
            settled = true;
            clearTimeout(killTimer);
            resolve(value);
          };
          const killTimer = setTimeout(() => {
            proc.kill('SIGKILL');
            finish({ ok: false, error: 'ffprobe timeout' });
          }, 7000);
          let stderr = '';
          proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
          });
          proc.on('error', (error) => finish({ ok: false, error: error.message }));
          proc.on('close', (code) => {
            if (code === 0) {
              finish({ ok: true, error: null });
              return;
            }
            const clean = stderr.trim();
            finish({ ok: false, error: clean.length ? clean.slice(0, 300) : `ffprobe exit ${code ?? -1}` });
          });
        });

        if (result.ok) {
          return { ok: true, port, path, error: null };
        }
        lastError = result.error;
      }
    }
    return { ok: false, port: null as number | null, path: null as string | null, error: lastError };
  }

  async getStatus(id: string) {
    try {
      const camera = await this.getCameraOrThrow(id);
      const rtspReachable = await this.portChecker.check(camera.ip, camera.rtspPort);
      const onvifReachable =
        camera.onvifPort == null ? true : await this.portChecker.check(camera.ip, camera.onvifPort);
      let rtspAuthOk = false;
      let detectedRtspPath: string | null = null;

      if (rtspReachable) {
        try {
          const password = this.cryptoService.decrypt(camera.passwordEncrypted);
          const rtspPathCandidates = Array.from(
            new Set(
              [
                camera.rtspPath?.trim().length ? camera.rtspPath : null,
                `/cam/realmonitor?channel=${camera.channel}&subtype=${camera.subtype}`,
                `/cam/realmonitor?channel=${camera.channel}&subtype=0`,
                '/cam/realmonitor?channel=1&subtype=0',
                '/cam/realmonitor?channel=1&subtype=1',
              ].filter((v): v is string => Boolean(v)),
            ),
          );
          const probe = await this.probeRtspPaths({
            ip: camera.ip,
            rtspPorts: [camera.rtspPort],
            username: camera.username,
            password,
            paths: rtspPathCandidates,
          });
          rtspAuthOk = probe.ok;
          detectedRtspPath = probe.path;
        } catch (error) {
          this.logger.warn(`Falha ao validar auth RTSP da câmera ${camera.id}: ${(error as Error).message}`);
        }
      }

      let status: CameraStatus = CameraStatus.OFFLINE;
      if (rtspReachable && onvifReachable && rtspAuthOk) {
        status = CameraStatus.ONLINE;
      }

      await this.prisma.camera.update({
        where: { id },
        data: {
          rtspPath: detectedRtspPath ?? camera.rtspPath,
          status,
          lastSeenAt: status === CameraStatus.ONLINE ? new Date() : undefined,
        },
      });

      const refreshed = await this.getCameraOrThrow(id);
      return {
        cameraId: refreshed.id,
        rtspReachable,
        rtspAuthOk,
        onvifReachable,
        status,
        lastSeenAt: refreshed.lastSeenAt,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      await this.prisma.camera.update({
        where: { id },
        data: {
          status: CameraStatus.ERROR,
        },
      });
      throw error;
    }
  }

  async getCameraOrThrow(id: string) {
    const camera = await this.prisma.camera.findUnique({ where: { id }, include: { site: true, area: true, group: true } });
    if (!camera) {
      throw new NotFoundException(`Camera ${id} não encontrada.`);
    }
    return camera;
  }

  async listEvents(cameraIds: string[], limit = 50) {
    return this.prisma.cameraEvent.findMany({
      where: { cameraId: { in: cameraIds } },
      include: { camera: { select: { name: true } } },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  }

  async listEventsFeed(params: {
    accessibleCameraIds: string[];
    cameraId?: string;
    type?: string;
    severity?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.max(1, Math.min(500, params.limit ?? 100));
    const offset = Math.max(0, params.offset ?? 0);
    const from = params.from ? new Date(params.from) : undefined;
    const to = params.to ? new Date(params.to) : undefined;
    const cameraIds = params.cameraId ? [params.cameraId] : params.accessibleCameraIds;
    const where = {
      cameraId: { in: cameraIds },
      ...(params.type ? { type: params.type } : {}),
      ...(params.severity ? { severity: params.severity } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.cameraEvent.findMany({
        where,
        include: { camera: { select: { name: true } } },
        orderBy: { occurredAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.cameraEvent.count({ where }),
    ]);

    return {
      items: items.map((event) => ({
        id: event.id,
        cameraId: event.cameraId,
        cameraName: event.camera?.name ?? null,
        type: event.type,
        severity: event.severity,
        message: event.message,
        metadata: event.metadata,
        occurredAt: event.occurredAt,
        createdAt: event.createdAt,
      })),
      total,
      limit,
      offset,
    };
  }

  async getOverview(accessibleIds?: string[]) {
    const where = accessibleIds ? { id: { in: accessibleIds } } : {};
    const cameras = await this.prisma.camera.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        recordingEnabled: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const thresholdMinutes = this.configService.get<number>('healthCheckOfflineMinutes') ?? 5;
    const staleThreshold = Date.now() - thresholdMinutes * 60 * 1000;
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cameraIds = cameras.map((camera) => camera.id);

    const [events24h, recordings24h] = await Promise.all([
      this.prisma.cameraEvent.count({
        where: {
          ...(cameraIds.length ? { cameraId: { in: cameraIds } } : {}),
          occurredAt: { gte: last24h },
        },
      }),
      this.prisma.recording.count({
        where: {
          ...(cameraIds.length ? { cameraId: { in: cameraIds } } : {}),
          startedAt: { gte: last24h },
        },
      }),
    ]);

    const summary = cameras.reduce(
      (acc, camera) => {
        acc.total += 1;
        if (camera.recordingEnabled) acc.recordingEnabled += 1;
        if (camera.status === CameraStatus.ONLINE) acc.online += 1;
        if (camera.status === CameraStatus.OFFLINE) acc.offline += 1;
        if (camera.status === CameraStatus.ERROR) acc.error += 1;
        if (camera.status === CameraStatus.UNKNOWN) acc.unknown += 1;
        return acc;
      },
      { total: 0, online: 0, offline: 0, error: 0, unknown: 0, recordingEnabled: 0 },
    );

    const stale = cameras
      .map((camera) => ({
        id: camera.id,
        name: camera.name,
        status: camera.status,
        lastSeenAt: camera.lastSeenAt?.toISOString() ?? null,
        stale:
          !camera.lastSeenAt ||
          (camera.status === CameraStatus.ONLINE && camera.lastSeenAt.getTime() < staleThreshold),
      }))
      .filter((camera) => camera.stale)
      .sort((a, b) => {
        const aTs = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
        const bTs = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
        return aTs - bTs;
      });

    return {
      summary,
      activity24h: {
        events: events24h,
        recordings: recordings24h,
      },
      stale: {
        thresholdMinutes,
        count: stale.length,
        items: stale.slice(0, 10),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async listIncidents(params: {
    accessibleCameraIds: string[];
    cameraId?: string;
    from?: string;
    to?: string;
    acknowledged?: boolean;
    limit?: number;
  }) {
    const limit = Math.max(1, Math.min(200, params.limit ?? 50));
    const from = params.from ? new Date(params.from) : undefined;
    const to = params.to ? new Date(params.to) : undefined;
    const cameraIds = params.cameraId ? [params.cameraId] : params.accessibleCameraIds;

    const items = await this.prisma.cameraEvent.findMany({
      where: {
        cameraId: { in: cameraIds },
        type: { startsWith: 'STREAM_' },
        ...(from || to
          ? {
              occurredAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: { camera: { select: { name: true } } },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(limit * 4, 500),
    });

    const mapped = items.map((event) => {
      const metadata = (event.metadata ?? {}) as Record<string, any>;
      const ack = (metadata.ack ?? {}) as Record<string, any>;
      const acknowledged = Boolean(ack.acknowledged);
      return {
        id: event.id,
        cameraId: event.cameraId,
        cameraName: event.camera?.name ?? null,
        type: event.type,
        severity: event.severity,
        message: event.message,
        occurredAt: event.occurredAt,
        metadata: metadata,
        acknowledged,
        acknowledgedAt: ack.at ?? null,
        acknowledgedByUserId: ack.byUserId ?? null,
        note: ack.note ?? null,
      };
    });

    const filtered =
      params.acknowledged === undefined ? mapped : mapped.filter((item) => item.acknowledged === params.acknowledged);

    return {
      items: filtered.slice(0, limit),
      total: filtered.length,
    };
  }

  async listAlarms(params: {
    accessibleCameraIds: string[];
    cameraId?: string;
    from?: string;
    to?: string;
    status?: 'OPEN' | 'ACKED' | 'RESOLVED';
    limit?: number;
  }) {
    const base = await this.listIncidents({
      accessibleCameraIds: params.accessibleCameraIds,
      cameraId: params.cameraId,
      from: params.from,
      to: params.to,
      limit: Math.max(1, Math.min(200, params.limit ?? 100)),
    });

    const withStatus = base.items.map((item) => {
      const metadata = (item.metadata ?? {}) as Record<string, any>;
      const alarm = (metadata.alarm ?? {}) as Record<string, any>;
      const ack = (metadata.ack ?? {}) as Record<string, any>;
      const status = alarm.resolved ? 'RESOLVED' : ack.acknowledged ? 'ACKED' : 'OPEN';
      const priority =
        item.severity === 'ERROR' ? 'P1' : item.severity === 'WARN' ? 'P2' : item.severity === 'INFO' ? 'P3' : 'P4';
      return {
        ...item,
        status,
        priority,
        resolvedAt: alarm.resolvedAt ?? null,
        resolvedByUserId: alarm.resolvedByUserId ?? null,
        resolvedByUserName: alarm.resolvedByUserName ?? null,
      };
    });

    const filtered = params.status ? withStatus.filter((item) => item.status === params.status) : withStatus;
    return {
      items: filtered,
      total: filtered.length,
    };
  }

  async exportIncidentsCsv(params: {
    accessibleCameraIds: string[];
    cameraId?: string;
    from?: string;
    to?: string;
    acknowledged?: boolean;
    limit?: number;
  }) {
    const result = await this.listIncidents({
      ...params,
      limit: params.limit ?? 1000,
    });

    const escape = (value: unknown) => {
      const text = value == null ? '' : String(value);
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const header = [
      'incidentId',
      'cameraId',
      'cameraName',
      'type',
      'severity',
      'message',
      'occurredAt',
      'acknowledged',
      'acknowledgedAt',
      'acknowledgedByUserId',
      'note',
    ];

    const rows = result.items.map((item) =>
      [
        item.id,
        item.cameraId,
        item.cameraName ?? '',
        item.type,
        item.severity,
        item.message,
        new Date(item.occurredAt).toISOString(),
        item.acknowledged ? 'true' : 'false',
        item.acknowledgedAt ?? '',
        item.acknowledgedByUserId ?? '',
        item.note ?? '',
      ]
        .map(escape)
        .join(','),
    );

    return [header.join(','), ...rows].join('\n');
  }

  async acknowledgeIncident(eventId: string, user: { id: string; name: string }, note?: string) {
    const event = await this.prisma.cameraEvent.findUnique({
      where: { id: eventId },
      include: { camera: { select: { name: true } } },
    });
    if (!event) {
      throw new NotFoundException('Incidente não encontrado.');
    }

    const metadata = (event.metadata ?? {}) as Record<string, any>;
    const nextMetadata = {
      ...metadata,
      ack: {
        acknowledged: true,
        at: new Date().toISOString(),
        byUserId: user.id,
        byUserName: user.name,
        note: note?.trim() || null,
      },
    };

    const updated = await this.prisma.cameraEvent.update({
      where: { id: eventId },
      data: {
        metadata: nextMetadata,
      },
      include: { camera: { select: { name: true } } },
    });

    return {
      id: updated.id,
      cameraId: updated.cameraId,
      cameraName: updated.camera?.name ?? null,
      type: updated.type,
      severity: updated.severity,
      message: updated.message,
      occurredAt: updated.occurredAt,
      metadata: updated.metadata,
    };
  }

  async resolveAlarm(eventId: string, user: { id: string; name: string }, note?: string) {
    const event = await this.prisma.cameraEvent.findUnique({
      where: { id: eventId },
      include: { camera: { select: { name: true } } },
    });
    if (!event || !event.type.startsWith('STREAM_')) {
      throw new NotFoundException('Alarme não encontrado.');
    }

    const metadata = (event.metadata ?? {}) as Record<string, any>;
    const nextMetadata = {
      ...metadata,
      ack: {
        ...(metadata.ack ?? {}),
        acknowledged: true,
        at: (metadata.ack as any)?.at ?? new Date().toISOString(),
        byUserId: (metadata.ack as any)?.byUserId ?? user.id,
        byUserName: (metadata.ack as any)?.byUserName ?? user.name,
        note: note?.trim() || (metadata.ack as any)?.note || null,
      },
      alarm: {
        resolved: true,
        resolvedAt: new Date().toISOString(),
        resolvedByUserId: user.id,
        resolvedByUserName: user.name,
      },
    };

    const updated = await this.prisma.cameraEvent.update({
      where: { id: eventId },
      data: { metadata: nextMetadata },
      include: { camera: { select: { name: true } } },
    });

    return {
      id: updated.id,
      cameraId: updated.cameraId,
      cameraName: updated.camera?.name ?? null,
      type: updated.type,
      severity: updated.severity,
      message: updated.message,
      occurredAt: updated.occurredAt,
      metadata: updated.metadata,
    };
  }

  async ensureIncidentExists(eventId: string) {
    const event = await this.prisma.cameraEvent.findUnique({
      where: { id: eventId },
      select: { id: true, cameraId: true, type: true },
    });
    if (!event || !event.type.startsWith('STREAM_')) {
      throw new NotFoundException('Incidente não encontrado.');
    }
    return event;
  }

  async getHealthScores(accessibleIds?: string[]) {
    const where = accessibleIds ? { id: { in: accessibleIds } } : {};
    const staleMinutes = this.configService.get<number>('healthCheckOfflineMinutes') ?? 5;
    const staleMs = staleMinutes * 60 * 1000;
    const now = Date.now();

    const cameras = await this.prisma.camera.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        recordingEnabled: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const counts = await this.prisma.cameraEvent.groupBy({
      by: ['cameraId'],
      where: {
        cameraId: { in: cameras.map((c) => c.id) },
        type: { startsWith: 'STREAM_' },
        occurredAt: { gte: last24h },
      },
      _count: { _all: true },
    });
    const countMap = new Map<string, number>(counts.map((item) => [item.cameraId, item._count._all]));

    const items = cameras.map((camera) => {
      let score = 100;
      const reasons: string[] = [];
      if (camera.status === CameraStatus.ERROR) {
        score -= 60;
        reasons.push('status_error');
      } else if (camera.status === CameraStatus.OFFLINE) {
        score -= 45;
        reasons.push('status_offline');
      } else if (camera.status === CameraStatus.UNKNOWN) {
        score -= 20;
        reasons.push('status_unknown');
      }

      if (!camera.lastSeenAt) {
        score -= 20;
        reasons.push('missing_last_seen');
      } else if (now - camera.lastSeenAt.getTime() > staleMs) {
        score -= 25;
        reasons.push('stale_heartbeat');
      }

      if (!camera.recordingEnabled) {
        score -= 10;
        reasons.push('recording_disabled');
      }

      const incidentCount = countMap.get(camera.id) ?? 0;
      if (incidentCount > 0) {
        score -= Math.min(35, incidentCount * 5);
        reasons.push(`stream_incidents_24h_${incidentCount}`);
      }

      const clamped = Math.max(0, Math.min(100, score));
      const level = clamped >= 85 ? 'GOOD' : clamped >= 60 ? 'ATTENTION' : 'CRITICAL';

      return {
        cameraId: camera.id,
        cameraName: camera.name,
        status: camera.status,
        lastSeenAt: camera.lastSeenAt?.toISOString() ?? null,
        recordingEnabled: camera.recordingEnabled,
        streamIncidents24h: incidentCount,
        score: clamped,
        level,
        reasons,
      };
    });

    return {
      items: items.sort((a, b) => a.score - b.score),
      generatedAt: new Date().toISOString(),
      staleThresholdMinutes: staleMinutes,
    };
  }

  async getReliabilityReport(days = 7, accessibleIds?: string[]) {
    const safeDays = Math.max(1, Math.min(90, days));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const where = accessibleIds ? { id: { in: accessibleIds } } : {};
    const cameras = await this.prisma.camera.findMany({
      where,
      select: { id: true, name: true, status: true, lastSeenAt: true, recordingEnabled: true },
    });

    const ids = cameras.map((camera) => camera.id);
    const incidents = await this.prisma.cameraEvent.findMany({
      where: {
        cameraId: { in: ids },
        type: { startsWith: 'STREAM_' },
        occurredAt: { gte: since },
      },
      select: { cameraId: true, occurredAt: true, metadata: true },
      orderBy: { occurredAt: 'asc' },
    });

    const recoveries = await this.prisma.cameraEvent.groupBy({
      by: ['cameraId'],
      where: {
        cameraId: { in: ids },
        type: 'HEALTH_AUTO_RECOVERED',
        occurredAt: { gte: since },
      },
      _count: { _all: true },
    });
    const recoveryMap = new Map<string, number>(recoveries.map((item) => [item.cameraId, item._count._all]));

    const incidentMap = new Map<string, Array<{ occurredAt: Date; ackAt: Date | null }>>();
    for (const incident of incidents) {
      const metadata = (incident.metadata ?? {}) as Record<string, any>;
      const ack = (metadata.ack ?? {}) as Record<string, any>;
      const ackAt = ack.at ? new Date(ack.at) : null;
      const current = incidentMap.get(incident.cameraId) ?? [];
      current.push({ occurredAt: incident.occurredAt, ackAt });
      incidentMap.set(incident.cameraId, current);
    }

    const perCamera = cameras.map((camera) => {
      const camIncidents = incidentMap.get(camera.id) ?? [];
      const incidentCount = camIncidents.length;
      const openCount = camIncidents.filter((inc) => !inc.ackAt).length;
      const ackedCount = incidentCount - openCount;
      const ackDurations = camIncidents
        .filter((inc) => inc.ackAt)
        .map((inc) => Math.max(0, (inc.ackAt!.getTime() - inc.occurredAt.getTime()) / 60000));
      const meanAckMinutes =
        ackDurations.length > 0 ? Number((ackDurations.reduce((a, b) => a + b, 0) / ackDurations.length).toFixed(2)) : null;
      const recoveryCount = recoveryMap.get(camera.id) ?? 0;
      const reliabilityScore = Math.max(
        0,
        Math.min(
          100,
          100 -
            incidentCount * 4 -
            openCount * 6 -
            (camera.status === CameraStatus.OFFLINE ? 20 : 0) -
            (camera.status === CameraStatus.ERROR ? 30 : 0),
        ),
      );

      return {
        cameraId: camera.id,
        cameraName: camera.name,
        status: camera.status,
        incidentCount,
        openCount,
        ackedCount,
        meanAckMinutes,
        recoveryCount,
        reliabilityScore,
        recordingEnabled: camera.recordingEnabled,
        lastSeenAt: camera.lastSeenAt?.toISOString() ?? null,
      };
    });

    return {
      days: safeDays,
      generatedAt: new Date().toISOString(),
      summary: {
        cameras: perCamera.length,
        incidents: perCamera.reduce((acc, cam) => acc + cam.incidentCount, 0),
        openIncidents: perCamera.reduce((acc, cam) => acc + cam.openCount, 0),
        meanReliabilityScore:
          perCamera.length > 0
            ? Number((perCamera.reduce((acc, cam) => acc + cam.reliabilityScore, 0) / perCamera.length).toFixed(2))
            : null,
      },
      items: perCamera.sort((a, b) => a.reliabilityScore - b.reliabilityScore),
    };
  }

  async getReliabilityTrend(days = 30, accessibleIds?: string[], cameraId?: string) {
    const safeDays = Math.max(1, Math.min(90, days));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const where = accessibleIds ? { id: { in: accessibleIds } } : {};
    const cameras = await this.prisma.camera.findMany({
      where,
      select: { id: true, name: true, status: true },
    });
    const validIds = new Set(cameras.map((camera) => camera.id));
    const targetCameraId = cameraId && validIds.has(cameraId) ? cameraId : undefined;
    const cameraFilter = targetCameraId ? [targetCameraId] : [...validIds];

    const incidents = await this.prisma.cameraEvent.findMany({
      where: {
        cameraId: { in: cameraFilter },
        type: { startsWith: 'STREAM_' },
        occurredAt: { gte: since },
      },
      select: { cameraId: true, occurredAt: true, metadata: true },
    });

    const recoveries = await this.prisma.cameraEvent.findMany({
      where: {
        cameraId: { in: cameraFilter },
        type: 'HEALTH_AUTO_RECOVERED',
        occurredAt: { gte: since },
      },
      select: { cameraId: true, occurredAt: true },
    });

    const dayKey = (date: Date) => date.toISOString().slice(0, 10);
    const trend = new Map<
      string,
      { date: string; incidents: number; acked: number; open: number; recoveries: number; score: number }
    >();
    for (let i = safeDays - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      const key = dayKey(d);
      trend.set(key, { date: key, incidents: 0, acked: 0, open: 0, recoveries: 0, score: 100 });
    }

    for (const incident of incidents) {
      const key = dayKey(incident.occurredAt);
      const row = trend.get(key);
      if (!row) continue;
      row.incidents += 1;
      const metadata = (incident.metadata ?? {}) as Record<string, any>;
      const ack = (metadata.ack ?? {}) as Record<string, any>;
      if (ack.acknowledged) row.acked += 1;
      else row.open += 1;
    }

    for (const recovery of recoveries) {
      const key = dayKey(recovery.occurredAt);
      const row = trend.get(key);
      if (!row) continue;
      row.recoveries += 1;
    }

    const items = [...trend.values()].map((row) => ({
      ...row,
      score: Math.max(0, Math.min(100, 100 - row.incidents * 4 - row.open * 6 + row.recoveries * 2)),
    }));

    return {
      days: safeDays,
      cameraId: targetCameraId ?? null,
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async getAlerts(accessibleIds?: string[]) {
    const health = await this.getHealthScores(accessibleIds);
    const warningThreshold = this.configService.get<number>('alertScoreWarning') ?? 75;
    const criticalThreshold = this.configService.get<number>('alertScoreCritical') ?? 60;
    const openCritical = this.configService.get<number>('alertOpenIncidentsCritical') ?? 5;
    const recentWindowMinutes = this.configService.get<number>('alertRecentWindowMinutes') ?? 60;

    const from = new Date(Date.now() - recentWindowMinutes * 60 * 1000);
    const cameraIds = health.items.map((item) => item.cameraId);
    const recentIncidents = await this.prisma.cameraEvent.groupBy({
      by: ['cameraId'],
      where: {
        cameraId: { in: cameraIds },
        type: { startsWith: 'STREAM_' },
        occurredAt: { gte: from },
      },
      _count: { _all: true },
    });
    const recentMap = new Map<string, number>(recentIncidents.map((item) => [item.cameraId, item._count._all]));

    const alerts = health.items
      .map((item) => {
        const recent = recentMap.get(item.cameraId) ?? 0;
        const criticalByScore = item.score < criticalThreshold;
        const criticalByOpen = item.streamIncidents24h >= openCritical;
        const warningByScore = item.score < warningThreshold;
        const warningByRecent = recent >= 2;
        if (!(criticalByScore || criticalByOpen || warningByScore || warningByRecent)) {
          return null;
        }
        const severity = criticalByScore || criticalByOpen ? 'CRITICAL' : 'WARNING';
        const reasons: string[] = [];
        if (criticalByScore) reasons.push(`score_below_${criticalThreshold}`);
        else if (warningByScore) reasons.push(`score_below_${warningThreshold}`);
        if (criticalByOpen) reasons.push(`incidents24h_ge_${openCritical}`);
        if (warningByRecent) reasons.push(`recent_incidents_${recent}_in_${recentWindowMinutes}m`);

        return {
          cameraId: item.cameraId,
          cameraName: item.cameraName,
          severity,
          score: item.score,
          status: item.status,
          streamIncidents24h: item.streamIncidents24h,
          streamIncidentsRecentWindow: recent,
          reasons,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'CRITICAL' ? -1 : 1;
        return a.score - b.score;
      });

    return {
      generatedAt: new Date().toISOString(),
      thresholds: {
        warningScore: warningThreshold,
        criticalScore: criticalThreshold,
        criticalOpenIncidents24h: openCritical,
        recentWindowMinutes,
      },
      summary: {
        total: alerts.length,
        critical: alerts.filter((item) => item.severity === 'CRITICAL').length,
        warning: alerts.filter((item) => item.severity === 'WARNING').length,
      },
      items: alerts,
    };
  }

  async getDiagnostics(id: string) {
    const camera = await this.getCameraOrThrow(id);
    const [status, latestRecording, recentEvents] = await Promise.all([
      this.getStatus(id),
      this.prisma.recording.findFirst({
        where: { cameraId: id },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          sizeBytes: true,
          filePath: true,
        },
      }),
      this.prisma.cameraEvent.findMany({
        where: { cameraId: id },
        orderBy: { occurredAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          severity: true,
          message: true,
          occurredAt: true,
        },
      }),
    ]);

    const now = Date.now();
    const lastSeenMs = camera.lastSeenAt ? new Date(camera.lastSeenAt).getTime() : null;
    const ageSeconds = lastSeenMs ? Math.max(0, Math.floor((now - lastSeenMs) / 1000)) : null;

    return {
      camera: {
        id: camera.id,
        name: camera.name,
        ip: camera.ip,
        status: camera.status,
        recordingEnabled: camera.recordingEnabled,
        lastSeenAt: camera.lastSeenAt,
      },
      connectivity: {
        rtspReachable: status.rtspReachable,
        onvifReachable: status.onvifReachable,
        checkedAt: status.checkedAt,
      },
      heartbeat: {
        ageSeconds,
        stale: ageSeconds == null ? true : ageSeconds > 300,
      },
      latestRecording: latestRecording
        ? {
            ...latestRecording,
            sizeBytes: latestRecording.sizeBytes ? latestRecording.sizeBytes.toString() : null,
          }
        : null,
      recentEvents,
      ffmpeg: {
        recordingFormat: process.env.FFMPEG_RECORDING_FORMAT ?? 'mp4',
        rtspTransport: process.env.FFMPEG_RTSP_TRANSPORT ?? 'tcp',
      },
    };
  }

  private async validateReferences(siteId?: string, areaId?: string, groupId?: string) {
    if (siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: siteId } });
      if (!site) {
        throw new NotFoundException('Site/unidade informada não existe.');
      }
    }
    if (areaId) {
      const area = await this.prisma.area.findUnique({ where: { id: areaId } });
      if (!area) {
        throw new NotFoundException('Área/setor informado não existe.');
      }
    }
    if (groupId) {
      const group = await this.prisma.cameraGroup.findUnique({ where: { id: groupId } });
      if (!group) {
        throw new NotFoundException('Grupo informado não existe.');
      }
    }
  }
}
