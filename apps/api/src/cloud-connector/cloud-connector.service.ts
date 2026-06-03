import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AlarmStatus, CameraStatus } from '@prisma/client';
import axios from 'axios';
import * as os from 'node:os';
import { statfs } from 'node:fs/promises';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RecordingProcessManagerService } from '../recordings/recording-process-manager.service';

type LicenseStatus = 'UNKNOWN' | 'ACTIVE' | 'GRACE' | 'RESTRICTED' | 'SUSPENDED';

const SETTING_KEYS = [
  'cloud.lastSyncAt',
  'cloud.lastError',
  'cloud.licenseStatus',
  'cloud.licenseMessage',
  'cloud.restrictions',
  'cloud.lastPayloadSummary',
];

@Injectable()
export class CloudConnectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CloudConnectorService.name);
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) return;

    const intervalMs = this.getIntervalMs();
    this.timer = setInterval(() => void this.syncHeartbeat(), intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();

    const firstRun = setTimeout(() => void this.syncHeartbeat(), 5000);
    if (typeof firstRun.unref === 'function') firstRun.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async getStatus() {
    const settings = await this.readSettings();

    return {
      ...this.getPublicConfig(),
      lastSyncAt: settings['cloud.lastSyncAt'] ?? null,
      lastError: settings['cloud.lastError'] ?? null,
      licenseStatus: (settings['cloud.licenseStatus'] as LicenseStatus | undefined) ?? 'UNKNOWN',
      licenseMessage: settings['cloud.licenseMessage'] ?? null,
      restrictions: this.parseJsonSetting(settings['cloud.restrictions'], {}),
      lastPayloadSummary: this.parseJsonSetting(settings['cloud.lastPayloadSummary'], null),
    };
  }

  async syncHeartbeat() {
    const config = this.getConfig();
    if (!config.enabled) return { skipped: true, reason: 'disabled' };
    if (!config.configured) {
      await this.writeSetting('cloud.lastError', 'Cloud connector sem CLOUD_API_URL, CLOUD_INSTALLATION_ID ou CLOUD_LICENSE_KEY.');
      return { skipped: true, reason: 'missing_config' };
    }
    if (this.syncing) return { skipped: true, reason: 'already_running' };

    this.syncing = true;
    try {
      const payload = await this.collectPayload();
      const response = await axios.post(`${config.apiUrl}/api/agent/heartbeat`, payload, {
        timeout: config.timeoutMs,
        headers: {
          'x-drac-installation-id': config.installationId,
          'x-drac-license-key': config.licenseKey,
        },
      });

      const licenseStatus = this.normalizeLicenseStatus(response.data?.licenseStatus);
      const restrictions = this.applyStatusCaps(licenseStatus, response.data?.restrictions ?? {});
      const licenseMessage = String(response.data?.licenseMessage ?? '');

      await Promise.all([
        this.writeSetting('cloud.lastSyncAt', new Date().toISOString()),
        this.writeSetting('cloud.lastError', ''),
        this.writeSetting('cloud.licenseStatus', licenseStatus),
        this.writeSetting('cloud.licenseMessage', licenseMessage),
        this.writeSetting('cloud.restrictions', JSON.stringify(restrictions)),
        this.writeSetting('cloud.lastPayloadSummary', JSON.stringify(payload.summary)),
      ]);
      await this.enforceRuntimeRestrictions(restrictions);

      return {
        skipped: false,
        synced: true,
        licenseStatus,
        restrictions,
        central: {
          acknowledged: Boolean(response.data?.ok ?? response.data?.accepted),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.writeSetting('cloud.lastError', message);
      this.logger.warn(`Falha ao enviar heartbeat para DRAC Central: ${message}`);
      return { skipped: false, synced: false, error: message };
    } finally {
      this.syncing = false;
    }
  }

  private isEnabled() {
    return String(process.env.CLOUD_CONNECTOR_ENABLED ?? 'false').toLowerCase() === 'true';
  }

  private getConfig() {
    const apiUrl = this.trimTrailingSlash(process.env.CLOUD_API_URL ?? '');
    const installationId = String(process.env.CLOUD_INSTALLATION_ID ?? '').trim();
    const licenseKey = String(process.env.CLOUD_LICENSE_KEY ?? '').trim();

    return {
      enabled: this.isEnabled(),
      configured: Boolean(apiUrl && installationId && licenseKey),
      apiUrl,
      installationId,
      licenseKey,
      timeoutMs: this.getPositiveInt(process.env.CLOUD_CONNECTOR_TIMEOUT_MS, 8000),
    };
  }

  private getPublicConfig() {
    const config = this.getConfig();
    return {
      enabled: config.enabled,
      configured: config.configured,
      apiUrl: config.apiUrl || null,
      installationId: config.installationId || null,
      heartbeatIntervalSeconds: Math.round(this.getIntervalMs() / 1000),
      customerName: process.env.CLOUD_CUSTOMER_NAME || null,
    };
  }

  private getIntervalMs() {
    return Math.max(this.getPositiveInt(process.env.CLOUD_HEARTBEAT_INTERVAL_SECONDS, 60), 15) * 1000;
  }

  private async collectPayload() {
    const recordingsRoot = process.env.RECORDINGS_ROOT ?? '/storage';
    const now = new Date();

    const [disk, cameraCounts, cameraOperational, recordings, recentRecordings, activeRecordings, openAlarms, activeUsers] = await Promise.all([
      this.getDiskStats(recordingsRoot),
      this.getCameraCounts(),
      this.getCameraOperationalStats(),
      this.prisma.recording.aggregate({
        _count: { id: true },
        _sum: { sizeBytes: true },
        _max: { startedAt: true },
      }),
      this.prisma.recording.count({
        where: { startedAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
      }),
      this.prisma.recording.count({ where: { endedAt: null } }),
      this.prisma.alarmInstance.count({ where: { status: AlarmStatus.OPEN } }),
      this.prisma.user.count({ where: { isActive: true } }),
    ]);

    const alerts: Array<{ level: 'warning' | 'critical'; code: string; message: string }> = [];
    if (disk?.usagePercent !== null && disk?.usagePercent !== undefined && disk.usagePercent >= 85) {
      alerts.push({ level: 'critical', code: 'disk_usage_high', message: `Uso de disco em ${disk.usagePercent}%.` });
    } else if (disk?.usagePercent !== null && disk?.usagePercent !== undefined && disk.usagePercent >= 75) {
      alerts.push({ level: 'warning', code: 'disk_usage_attention', message: `Uso de disco em ${disk.usagePercent}%.` });
    }
    if (cameraCounts.offline + cameraCounts.error > 0) {
      alerts.push({
        level: 'warning',
        code: 'cameras_unavailable',
        message: `${cameraCounts.offline + cameraCounts.error} camera(s) indisponivel(is).`,
      });
    }
    if (cameraCounts.total > 0 && cameraCounts.online === 0) {
      alerts.push({ level: 'critical', code: 'no_online_cameras', message: 'Nenhuma camera online.' });
    }
    if (recordings._count.id > 0 && !recordings._max.startedAt) {
      alerts.push({ level: 'warning', code: 'recording_without_last_segment', message: 'Gravacoes sem ultimo segmento detectado.' });
    }

    const mediamtxOriginsRestricted =
      String(process.env.MEDIAMTX_HLS_ALLOW_ORIGIN ?? '*') !== '*' &&
      String(process.env.MEDIAMTX_WEBRTC_ALLOW_ORIGIN ?? '*') !== '*';
    const recordingRuntime = this.getRecordingRuntimeSummary();
    const recordingCapacity = await this.getRecordingCapacityEstimate(disk);
    if (cameraCounts.total > 0 && cameraOperational.recordingEnabled === 0) {
      alerts.push({
        level: 'warning',
        code: 'recording_disabled_all',
        message: 'Nenhuma camera esta com gravacao continua habilitada.',
      });
    }
    if (recordingCapacity.status === 'blocked') {
      alerts.push({
        level: 'critical',
        code: 'recording_storage_capacity_insufficient',
        message: `Storage insuficiente para ${recordingCapacity.retentionDays}d de retencao: estimado ${recordingCapacity.estimatedRequiredGb}GB, capacidade segura ${recordingCapacity.safeCapacityGb}GB.`,
      });
    } else if (recordingCapacity.status === 'attention') {
      alerts.push({
        level: 'warning',
        code: 'recording_storage_capacity_attention',
        message: `Storage apertado para ${recordingCapacity.retentionDays}d de retencao: estimado ${recordingCapacity.estimatedRequiredGb}GB, capacidade segura ${recordingCapacity.safeCapacityGb}GB.`,
      });
    }
    const appReadinessStatus = alerts.some((alert) => alert.level === 'critical')
      ? 'blocked'
      : alerts.length > 0 || !mediamtxOriginsRestricted
        ? 'attention'
        : 'ready';

    return {
      installation: {
        id: process.env.CLOUD_INSTALLATION_ID,
        customerName: process.env.CLOUD_CUSTOMER_NAME || os.hostname(),
        version: process.env.DRAC_VERSION || process.env.npm_package_version || 'local',
      },
      summary: {
        status: appReadinessStatus === 'blocked' ? 'blocked' : appReadinessStatus === 'attention' ? 'attention' : 'ok',
        productionReadiness: appReadinessStatus,
        cameraTotal: cameraCounts.total,
        cameraOnline: cameraCounts.online,
        cameraOffline: cameraCounts.offline,
        cameraError: cameraCounts.error,
        openAlarms,
        recordingCount: recordings._count.id,
        recordingBytes: Number(recordings._sum.sizeBytes ?? 0),
        lastRecordingStartedAt: recordings._max.startedAt,
        recentRecordingCountLastHour: recentRecordings,
        activeRecordingCount: recordingRuntime?.activeCount ?? activeRecordings,
        recordingCapacityStatus: recordingCapacity.status,
        activeUsers,
        diskUsagePercent: disk?.usagePercent ?? null,
        alerts,
      },
      server: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        uptimeSeconds: os.uptime(),
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg(),
      },
      storage: {
        recordingsRoot,
        disk,
      },
      production: {
        readiness: {
          status: appReadinessStatus,
          generatedAt: now.toISOString(),
          alerts,
        },
        cameras: cameraOperational,
        recordings: {
          totalCount: recordings._count.id,
          totalBytes: Number(recordings._sum.sizeBytes ?? 0),
          activeCount: recordingRuntime?.activeCount ?? activeRecordings,
          activeDatabaseSegments: activeRecordings,
          recentCountLastHour: recentRecordings,
          lastStartedAt: recordings._max.startedAt,
          runtime: recordingRuntime,
          capacity: recordingCapacity,
        },
        ai: {
          autoStartEnabled: String(process.env.AI_AUTO_START_ENABLED ?? 'true') !== 'false',
          usesMediamtx: String(process.env.AI_USE_MEDIAMTX ?? 'false') === 'true',
          rtspSubtype: process.env.AI_RTSP_SUBTYPE ?? 'auto',
          analyticsSource: process.env.AI_ANALYTICS_SOURCE ?? 'direct_camera',
        },
        security: {
          cameraTestAllowPublicIp: String(process.env.CAMERA_TEST_ALLOW_PUBLIC_IP ?? 'false') === 'true',
          mediamtxOriginsRestricted,
          hlsAllowOrigin: process.env.MEDIAMTX_HLS_ALLOW_ORIGIN ?? '*',
          webrtcAllowOrigin: process.env.MEDIAMTX_WEBRTC_ALLOW_ORIGIN ?? '*',
          dockerSocketMountedInApi: false,
        },
      },
      time: now.toISOString(),
    };
  }

  private async getCameraCounts() {
    const grouped = await this.prisma.camera.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    const counts = { total: 0, online: 0, offline: 0, error: 0, unknown: 0 };

    for (const row of grouped) {
      const count = row._count.id;
      counts.total += count;
      if (row.status === CameraStatus.ONLINE) counts.online += count;
      if (row.status === CameraStatus.OFFLINE) counts.offline += count;
      if (row.status === CameraStatus.ERROR) counts.error += count;
      if (row.status === CameraStatus.UNKNOWN) counts.unknown += count;
    }

    return counts;
  }

  private getRecordingRuntimeSummary() {
    try {
      const manager = this.moduleRef.get(RecordingProcessManagerService, { strict: false }) as RecordingProcessManagerService & {
        getRuntimeSummary?: () => unknown;
      };
      return typeof manager.getRuntimeSummary === 'function' ? manager.getRuntimeSummary() : null;
    } catch {
      return null;
    }
  }

  private async getCameraOperationalStats() {
    const [
      total,
      recordingEnabled,
      aiEnabled,
      audioEnabled,
      byLiveProtocol,
      byLiveSubtype,
      byRecordingSubtype,
      byAnalyticsSubtype,
      byDetectedCodec,
    ] = await Promise.all([
      this.prisma.camera.count(),
      this.prisma.camera.count({ where: { recordingEnabled: true } }),
      this.prisma.camera.count({ where: { aiEnabled: true } }),
      this.prisma.camera.count({ where: { audioEnabled: true } }),
      this.prisma.camera.groupBy({ by: ['preferredLiveProtocol'], _count: { id: true } }),
      this.prisma.camera.groupBy({ by: ['liveSubtype'], _count: { id: true } }),
      this.prisma.camera.groupBy({ by: ['recordingSubtype'], _count: { id: true } }),
      this.prisma.camera.groupBy({ by: ['analyticsSubtype'], _count: { id: true } }),
      this.prisma.camera.groupBy({ by: ['detectedVideoCodec'], _count: { id: true } }),
    ]);

    return {
      total,
      recordingEnabled,
      aiEnabled,
      audioEnabled,
      byLiveProtocol: this.groupRowsToRecord(byLiveProtocol, 'preferredLiveProtocol'),
      byLiveSubtype: this.groupRowsToRecord(byLiveSubtype, 'liveSubtype'),
      byRecordingSubtype: this.groupRowsToRecord(byRecordingSubtype, 'recordingSubtype'),
      byAnalyticsSubtype: this.groupRowsToRecord(byAnalyticsSubtype, 'analyticsSubtype'),
      byDetectedCodec: this.groupRowsToRecord(byDetectedCodec, 'detectedVideoCodec'),
    };
  }

  private groupRowsToRecord(rows: Array<Record<string, unknown> & { _count: { id: number } }>, field: string) {
    return Object.fromEntries(
      rows.map((row) => {
        const rawValue = row[field];
        const key = rawValue === null || rawValue === undefined || rawValue === '' ? 'unset' : String(rawValue);
        return [key, row._count.id];
      }),
    );
  }

  private async getRecordingCapacityEstimate(disk: { totalBytes: number | null }) {
    const retentionDays = this.getPositiveInt(process.env.RECORDING_RETENTION_DAYS ?? process.env.RETENTION_DAYS, 7);
    const safeCapacityBytes = disk.totalBytes == null ? null : disk.totalBytes * 0.8;
    let estimatedRequiredBytes = 0;
    let source = 'indisponivel';

    const recordingStats = await this.prisma.recording.aggregate({
      _sum: { sizeBytes: true },
      _min: { startedAt: true },
      _max: { startedAt: true },
    });
    const totalRecordingBytes = Number(recordingStats._sum.sizeBytes ?? 0);
    const minStartedAt = recordingStats._min.startedAt?.getTime() ?? null;
    const maxStartedAt = recordingStats._max.startedAt?.getTime() ?? null;
    const historySeconds = minStartedAt != null && maxStartedAt != null ? Math.max((maxStartedAt - minStartedAt) / 1000, 0) : 0;

    if (totalRecordingBytes > 0 && historySeconds >= 900) {
      estimatedRequiredBytes = (totalRecordingBytes / historySeconds) * 86400 * retentionDays;
      source = 'historical_recording_rate';
    } else {
      const [cameraCount, knownBitrateCount, bitrate] = await Promise.all([
        this.prisma.camera.count(),
        this.prisma.camera.count({ where: { recordingBitrateKbps: { gt: 0 } } }),
        this.prisma.camera.aggregate({ _sum: { recordingBitrateKbps: true } }),
      ]);
      const fallbackKbps = this.getPositiveInt(process.env.RECORDING_CAPACITY_FALLBACK_CAMERA_KBPS, 4096);
      const knownKbps = Number(bitrate._sum.recordingBitrateKbps ?? 0);
      const missingCount = Math.max(cameraCount - knownBitrateCount, 0);
      const estimatedKbps = knownKbps + missingCount * fallbackKbps;
      estimatedRequiredBytes = (estimatedKbps * 1000 * 86400 * retentionDays) / 8;
      source = `configured_bitrate_with_${fallbackKbps}kbps_fallback`;
    }

    const status =
      safeCapacityBytes == null || safeCapacityBytes <= 0
        ? 'unknown'
        : estimatedRequiredBytes > safeCapacityBytes
          ? 'blocked'
          : estimatedRequiredBytes > safeCapacityBytes * 0.7
            ? 'attention'
            : 'ready';

    return {
      status,
      source,
      retentionDays,
      estimatedRequiredBytes: Math.round(estimatedRequiredBytes),
      estimatedRequiredGb: Math.round((estimatedRequiredBytes / 1024 / 1024 / 1024) * 10) / 10,
      safeCapacityBytes: safeCapacityBytes == null ? null : Math.round(safeCapacityBytes),
      safeCapacityGb: safeCapacityBytes == null ? null : Math.round((safeCapacityBytes / 1024 / 1024 / 1024) * 10) / 10,
    };
  }

  private async getDiskStats(path: string) {
    try {
      const disk = await statfs(path);
      const totalBytes = Number(disk.blocks) * Number(disk.bsize);
      const freeBytes = Number(disk.bavail) * Number(disk.bsize);
      const usedBytes = Math.max(totalBytes - freeBytes, 0);
      return {
        totalBytes,
        usedBytes,
        freeBytes,
        usagePercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
      };
    } catch (error) {
      return {
        totalBytes: null,
        usedBytes: null,
        freeBytes: null,
        usagePercent: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async readSettings() {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: SETTING_KEYS } },
    });

    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  private async writeSetting(key: string, value: string) {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  private parseJsonSetting(value: string | undefined, fallback: unknown) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  private normalizeLicenseStatus(value: unknown): LicenseStatus {
    if (value === 'ACTIVE' || value === 'GRACE' || value === 'RESTRICTED' || value === 'SUSPENDED') return value;
    return 'UNKNOWN';
  }

  private async enforceRuntimeRestrictions(restrictions: Record<string, unknown>) {
    if (restrictions.localRecording === false) {
      try {
        const manager = this.moduleRef.get(RecordingProcessManagerService, { strict: false });
        await manager.stopAll();
      } catch (error) {
        this.logger.warn(`Falha ao parar gravacoes por restricao comercial: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (restrictions.aiAdvanced === false) {
      try {
        const aiService = this.moduleRef.get(AiService, { strict: false });
        await aiService.stopAll();
      } catch (error) {
        this.logger.warn(`Falha ao parar IA por restricao comercial: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private applyStatusCaps(status: LicenseStatus, restrictions: Record<string, unknown>) {
    if (status === 'SUSPENDED') {
      return {
        ...restrictions,
        localLive: false,
        localRecording: false,
        addCameras: false,
        aiAdvanced: false,
        cloudSupport: false,
        updates: false,
      };
    }
    if (status === 'RESTRICTED') {
      return {
        ...restrictions,
        addCameras: false,
        aiAdvanced: false,
        updates: false,
      };
    }
    return restrictions;
  }

  private getPositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private trimTrailingSlash(value: string) {
    return value.trim().replace(/\/+$/, '');
  }
}
