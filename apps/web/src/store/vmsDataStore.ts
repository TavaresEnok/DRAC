import axios from 'axios';
import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { getApiBaseUrl } from '../lib/api-base';

export interface Camera {
  id: string;
  code: string;
  name: string;
  location: string;
  zone: string;
  building: string;
  floor: string;
  ipAddress: string;
  rtspPort: number;
  model: string;
  status: 'online' | 'offline' | 'recording' | 'motion' | 'alarm' | 'no_signal' | 'maintenance';
  fps: number;
  resolution: string;
  storage: string;
  lastEvent?: string;
  ptzCapable: boolean;
  hasAudio: boolean;
  aiEnabled: boolean;
  isOnline: boolean;
  signalStrength: number;
  recordingMode: 'continuous' | 'motion' | 'schedule' | 'manual';
  retentionDays: number;
  preferredRtspTransport: 'tcp' | 'udp';
  preferredLiveProtocol: 'auto' | 'flv' | 'hls' | 'llhls' | 'webrtc' | 'mjpeg';
  rtspPath?: string;
  liveChannel?: number | null;
  liveSubtype?: number | null;
  recordingChannel?: number | null;
  recordingSubtype?: number | null;
  analyticsChannel?: number | null;
  analyticsSubtype?: number | null;
  streamVideoCodec?: string;
  streamWidth?: number | null;
  streamHeight?: number | null;
  streamFps?: number | null;
  streamBitrateKbps?: number | null;
  recordingVideoCodec?: string;
  recordingWidth?: number | null;
  recordingHeight?: number | null;
  recordingFps?: number | null;
  recordingBitrateKbps?: number | null;
  detectedVideoCodec?: string;
  detectedWidth?: number | null;
  detectedHeight?: number | null;
  detectedFps?: number | null;
  detectedBitrateKbps?: number | null;
  lastMotion?: string;
  thumbnailColor: string;
  recordingStatusDetail?: string;
  recordingStale?: boolean;
  lastSegmentAt?: string | null;
  lastSegmentAgeSeconds?: number | null;
}

export interface User {
  id: string;
  name: string;
  role: 'operator' | 'supervisor' | 'admin';
  email: string;
  badge: string;
  lastLogin: string;
  shift: 'morning' | 'afternoon' | 'night';
  active: boolean;
}

export interface VMSEvent {
  id: string;
  type: string;
  cameraId: string;
  cameraName: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  acknowledged: boolean;
  description: string;
  thumbnail?: string;
}

export interface Alarm {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'acknowledged' | 'resolved';
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  cameraId: string;
  zone: string;
  description: string;
  notes?: string;
  isSnoozed?: boolean;
  snoozedUntil?: string;
  transitionHistory?: Array<Record<string, unknown>>;
  notificationDelivery?: Array<Record<string, unknown>>;
  lastNotificationStatus?: string;
  occurrenceCount?: number;
  lastOccurredAt?: string;
}

export interface SavedLayout {
  id: string;
  name: string;
  gridSize: '1x1' | '2x2' | '3x3' | '4x4';
  cameraIds: string[];
  createdBy: string;
  lastUsed: string;
}

interface OverviewSummary {
  total: number;
  online: number;
  offline: number;
  error: number;
  unknown: number;
  recordingEnabled: number;
}

interface SystemSummary {
  status: string;
  service: string;
  recordingsRoot: string;
  server: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    uptimeSeconds: number;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
    cpuCount: number;
    loadAverage: number[];
  };
  disk: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
  };
  recordings: {
    count: number;
    totalBytes: number;
    lastStartedAt: string | null;
  };
  time: string;
}

interface RecordingItem {
  id: string;
  cameraId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  sizeBytes: string;
  playUrl: string;
  thumbnailUrl: string | null;
}

interface AuditLogItem {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
}

interface VmsDataState {
  cameras: Camera[];
  users: User[];
  events: VMSEvent[];
  alarms: Alarm[];
  recordings: RecordingItem[];
  layouts: SavedLayout[];
  overview: OverviewSummary | null;
  system: SystemSummary | null;
  auditLogs: AuditLogItem[];
  operationsTimeline: Array<{
    kind: 'event' | 'alarm' | 'action';
    at: string;
    cameraId: string | null;
    cameraName: string | null;
    severity: string;
    type: string;
    message: string;
    eventId: string | null;
    alarmId: string | null;
    alarmStatus: string | null;
    action: string | null;
    actor: string | null;
  }>;
  isLoading: boolean;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  updateUserActive: (id: string, active: boolean) => Promise<void>;
  acknowledgeAlarm: (id: string, note?: string) => Promise<void>;
  resolveAlarm: (id: string, note?: string) => Promise<void>;
  snoozeAlarm: (id: string, minutes?: number, note?: string) => Promise<void>;
  unsnoozeAlarm: (id: string, note?: string) => Promise<void>;
  bulkAlarmAction: (action: 'ack' | 'resolve' | 'snooze' | 'unsnooze', eventIds: string[], opts?: { note?: string; minutes?: number }) => Promise<void>;
  addNote: (id: string, note: string) => void;
}

type RecordingRuntimeStatus = {
  cameraId: string;
  isRecording: boolean;
  intendedRecording?: boolean;
  stale?: boolean;
  statusDetail?: string;
  lastSegmentAt?: string | null;
  lastSegmentAgeSeconds?: number | null;
};

const API_URL = getApiBaseUrl();
const THUMBNAIL_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function api() {
  const accessToken = useAuthStore.getState().accessToken;
  return axios.create({
    baseURL: API_URL,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
}

function mapRole(role: string): User['role'] {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return 'admin';
  if (role === 'OPERATOR') return 'operator';
  return 'supervisor';
}

function mapSeverity(severity: string): VMSEvent['severity'] {
  if (severity === 'CRITICAL') return 'critical';
  if (severity === 'WARNING') return 'warning';
  return 'info';
}

function mapCameraStatus(status: string, recordingEnabled: boolean, runtime?: RecordingRuntimeStatus): Camera['status'] {
  if (status === 'ONLINE') return (runtime?.isRecording ?? recordingEnabled) ? 'recording' : 'online';
  if (status === 'ERROR') return 'alarm';
  if (status === 'OFFLINE') return 'offline';
  return 'no_signal';
}

function cameraLayoutGridSize(count: number): SavedLayout['gridSize'] {
  if (count <= 1) return '1x1';
  if (count <= 4) return '2x2';
  if (count <= 9) return '3x3';
  return '4x4';
}

function formatResolution(width?: number | null, height?: number | null) {
  if (!width || !height) return '—';
  return `${width}x${height}`;
}

function formatCodec(codec?: string | null) {
  if (!codec) return 'Câmera IP';
  return codec.toUpperCase();
}

export const useVmsDataStore = create<VmsDataState>((set, get) => ({
  cameras: [],
  users: [],
  events: [],
  alarms: [],
  recordings: [],
  layouts: [],
  overview: null,
  system: null,
  auditLogs: [],
  operationsTimeline: [],
  isLoading: false,
  loaded: false,
  error: null,
  load: async () => {
    if (!useAuthStore.getState().accessToken) {
      set({ cameras: [], users: [], events: [], alarms: [], recordings: [], layouts: [], overview: null, system: null, auditLogs: [], operationsTimeline: [], loaded: false });
      return;
    }

    set({ isLoading: true, error: null });
    const client = api();

    try {
      const [
        camerasRes,
        usersRes,
        overviewRes,
        eventsRes,
        alarmsRes,
        recordingsRes,
        operationsTimelineRes,
        recordingStatusesRes,
        systemRes,
        auditRes,
      ] = await Promise.all([
        client.get('/cameras'),
        client.get('/users').catch(() => ({ data: [] })),
        client.get('/cameras/overview'),
        client.get('/cameras/events-feed?limit=100'),
        client.get('/cameras/alarms?limit=100'),
        client.get('/recordings?limit=100&sort=desc'),
        client.get('/cameras/operations-timeline?limit=120').catch(() => ({ data: { items: [] } })),
        client.get('/recordings/statuses').catch(() => ({ data: { items: [] } })),
        client.get('/health/system').catch(() => ({ data: null })),
        client.get('/audit-logs?limit=100').catch(() => ({ data: { items: [] } })),
      ]);

      const rawEvents = Array.isArray(eventsRes.data?.items) ? eventsRes.data.items : [];
      const rawAlarms = Array.isArray(alarmsRes.data?.items) ? alarmsRes.data.items : [];
      const runtimeStatuses = new Map<string, RecordingRuntimeStatus>(
        Array.isArray(recordingStatusesRes.data?.items)
          ? recordingStatusesRes.data.items.map((item: RecordingRuntimeStatus) => [item.cameraId, item] as const)
          : [],
      );
      const cameras: Camera[] = (Array.isArray(camerasRes.data) ? camerasRes.data : []).map((camera: any, index: number) => {
        const lastEvent = rawEvents.find((event: any) => event.cameraId === camera.id)?.occurredAt;
        const runtime = runtimeStatuses.get(camera.id);
        const configuredStreamWidth = camera.streamWidth ?? null;
        const configuredStreamHeight = camera.streamHeight ?? null;
        const detectedStreamWidth = camera.detectedWidth ?? configuredStreamWidth;
        const detectedStreamHeight = camera.detectedHeight ?? configuredStreamHeight;
        const effectiveFps = camera.streamFps ?? camera.detectedFps ?? (camera.status === 'ONLINE' ? 0 : 0);
        const effectiveRecordingMode = (camera.recordingMode ?? (camera.recordingEnabled ? 'continuous' : 'manual')) as Camera['recordingMode'];
        return {
          id: camera.id,
          code: camera.name,
          name: camera.name,
          location: camera.ip,
          zone: camera.area?.name ?? camera.site?.name ?? 'Sem zona',
          building: camera.site?.name ?? 'Sem unidade',
          floor: camera.group?.name ?? '-',
          ipAddress: camera.ip,
          rtspPort: camera.rtspPort ?? 554,
          model: `${formatCodec(camera.detectedVideoCodec ?? camera.streamVideoCodec)}${camera.rtspPath ? ' / RTSP' : ''}`,
          status: mapCameraStatus(camera.status, camera.recordingEnabled, runtime),
          fps: effectiveFps ?? 0,
          resolution: formatResolution(detectedStreamWidth, detectedStreamHeight),
          storage: camera.recordingEnabled ? `${camera.retentionDays ?? 7} dias de retenção` : 'Gravação desabilitada',
          lastEvent,
          ptzCapable: Boolean(camera.onvifPath || camera.onvifProfileToken),
          hasAudio: Boolean(camera.audioEnabled),
          aiEnabled: camera.aiEnabled !== false,
          isOnline: camera.status === 'ONLINE',
          signalStrength: camera.status === 'ONLINE' ? 100 : 0,
          recordingMode: effectiveRecordingMode,
          retentionDays: camera.retentionDays ?? 7,
          preferredRtspTransport: camera.preferredRtspTransport ?? 'tcp',
          preferredLiveProtocol: camera.preferredLiveProtocol ?? 'webrtc',
          rtspPath: camera.rtspPath ?? undefined,
          liveChannel: camera.liveChannel ?? null,
          liveSubtype: camera.liveSubtype ?? null,
          recordingChannel: camera.recordingChannel ?? null,
          recordingSubtype: camera.recordingSubtype ?? null,
          analyticsChannel: camera.analyticsChannel ?? null,
          analyticsSubtype: camera.analyticsSubtype ?? null,
          streamVideoCodec: camera.streamVideoCodec ?? undefined,
          streamWidth: configuredStreamWidth,
          streamHeight: configuredStreamHeight,
          streamFps: camera.streamFps ?? null,
          streamBitrateKbps: camera.streamBitrateKbps ?? null,
          recordingVideoCodec: camera.recordingVideoCodec ?? undefined,
          recordingWidth: camera.recordingWidth ?? null,
          recordingHeight: camera.recordingHeight ?? null,
          recordingFps: camera.recordingFps ?? null,
          recordingBitrateKbps: camera.recordingBitrateKbps ?? null,
          detectedVideoCodec: camera.detectedVideoCodec ?? undefined,
          detectedWidth: camera.detectedWidth ?? null,
          detectedHeight: camera.detectedHeight ?? null,
          detectedFps: camera.detectedFps ?? null,
          detectedBitrateKbps: camera.detectedBitrateKbps ?? null,
          lastMotion: lastEvent,
          thumbnailColor: THUMBNAIL_COLORS[index % THUMBNAIL_COLORS.length],
          recordingStatusDetail: undefined,
          recordingStale: false,
          lastSegmentAt: runtime?.lastSegmentAt ?? null,
          lastSegmentAgeSeconds: typeof runtime?.lastSegmentAgeSeconds === 'number' ? runtime.lastSegmentAgeSeconds : null,
        };
      });

      const users: User[] = (Array.isArray(usersRes.data) ? usersRes.data : []).map((user: any) => ({
        id: user.id,
        name: user.name,
        role: mapRole(user.role),
        email: user.email,
        badge: `USR-${user.id.slice(0, 6).toUpperCase()}`,
        lastLogin: user.updatedAt,
        shift: 'morning',
        active: Boolean(user.isActive),
      }));

      const events: VMSEvent[] = rawEvents.map((event: any) => ({
        id: event.id,
        type: event.type,
        cameraId: event.cameraId,
        cameraName: event.cameraName,
        timestamp: event.occurredAt,
        severity: mapSeverity(event.severity),
        acknowledged: Boolean(event.acknowledgedAt || event.acknowledgedBy),
        description: event.message,
      }));

      const alarms: Alarm[] = rawAlarms.map((alarm: any) => ({
        id: alarm.id,
        name: alarm.title || `${alarm.type} — ${alarm.cameraName}`,
        type: alarm.type,
        status: alarm.status === 'RESOLVED' ? 'resolved' : alarm.status === 'ACKED' ? 'acknowledged' : 'active',
        priority: alarm.priority ?? (alarm.severity === 'CRITICAL' ? 'P1' : alarm.severity === 'WARNING' ? 'P2' : 'P4'),
        triggeredAt: alarm.occurredAt,
        acknowledgedAt: alarm.acknowledgedAt ?? undefined,
        acknowledgedBy: alarm.acknowledgedByUserName ?? undefined,
        cameraId: alarm.cameraId,
        zone: cameras.find((camera) => camera.id === alarm.cameraId)?.zone ?? 'Sem zona',
        description: alarm.message,
        notes: alarm.note ?? undefined,
        isSnoozed: Boolean(alarm.isSnoozed),
        snoozedUntil: alarm.snoozedUntil ?? undefined,
        transitionHistory: Array.isArray(alarm.transitionHistory) ? alarm.transitionHistory : [],
        notificationDelivery: Array.isArray(alarm.notificationDelivery) ? alarm.notificationDelivery : [],
        lastNotificationStatus: typeof alarm.lastNotificationStatus === 'string' ? alarm.lastNotificationStatus : undefined,
      }));

      const recordings: RecordingItem[] = Array.isArray(recordingsRes.data?.items) ? recordingsRes.data.items : [];
      const gridSize = cameraLayoutGridSize(cameras.length);
      const layouts: SavedLayout[] = cameras.length
        ? [{
            id: 'default-live-layout',
            name: 'Layout Atual',
            gridSize,
            cameraIds: cameras.map((camera) => camera.id),
            createdBy: useAuthStore.getState().user?.name ?? 'Sistema',
            lastUsed: new Date().toISOString(),
          }]
        : [];

      set({
        cameras,
        users,
        events,
        alarms,
        recordings,
        layouts,
        overview: overviewRes.data?.summary ?? null,
        system: systemRes.data ?? null,
        auditLogs: Array.isArray(auditRes.data?.items) ? auditRes.data.items : [],
        operationsTimeline: Array.isArray(operationsTimelineRes.data?.items) ? operationsTimelineRes.data.items : [],
        isLoading: false,
        loaded: true,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'Falha ao carregar dados do sistema.',
      });
    }
  },
  updateUserActive: async (id, active) => {
    await api().patch(`/users/${id}`, { isActive: active });
    set((state) => ({
      users: state.users.map((user) => (user.id === id ? { ...user, active } : user)),
    }));
  },
  acknowledgeAlarm: async (id, note) => {
    await api().post(`/cameras/alarms/${id}/ack`, { note });
    set((state) => ({
      alarms: state.alarms.map((alarm) =>
        alarm.id === id
          ? { ...alarm, status: 'acknowledged', acknowledgedAt: new Date().toISOString(), acknowledgedBy: useAuthStore.getState().user?.name ?? 'Operador' }
          : alarm,
      ),
    }));
  },
  resolveAlarm: async (id, note) => {
    await api().post(`/cameras/alarms/${id}/resolve`, { note });
    set((state) => ({
      alarms: state.alarms.map((alarm) => (alarm.id === id ? { ...alarm, status: 'resolved', notes: note ?? alarm.notes } : alarm)),
    }));
  },
  snoozeAlarm: async (id, minutes, note) => {
    await api().post(`/cameras/alarms/${id}/snooze`, { minutes: minutes ?? 15, note });
    await get().load();
  },
  unsnoozeAlarm: async (id, note) => {
    await api().post(`/cameras/alarms/${id}/unsnooze`, { note });
    await get().load();
  },
  bulkAlarmAction: async (action, eventIds, opts) => {
    await api().post('/cameras/alarms/bulk', { action, eventIds, note: opts?.note, minutes: opts?.minutes });
    await get().load();
  },
  addNote: (id, note) => {
    set((state) => ({
      alarms: state.alarms.map((alarm) => (alarm.id === id ? { ...alarm, notes: alarm.notes ? `${alarm.notes}\n${note}` : note } : alarm)),
    }));
  },
}));
