import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from 'react';
import axios from 'axios';
import { useLocation } from 'wouter';
import {
  Camera as CameraIcon,
  Download,
  FastForward,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { addMinutes, format, isSameDay, startOfDay } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '../hooks/use-toast';
import { getApiBaseUrl } from '../lib/api-base';
import { useAuthStore } from '../store/authStore';
import { useVmsDataStore } from '../store/vmsDataStore';

type TimelineSegment = {
  recordingId?: string;
  start: number;
  end: number;
  type: 'recorded' | 'recorded_broken' | 'gap' | 'motion' | 'alarm';
};

type RecordingItem = {
  id: string;
  cameraId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  sizeBytes: string;
  fileExists: boolean;
  fileUsable?: boolean;
  actualSizeBytes?: number;
  compatibleCached?: boolean;
  playUrl: string;
  compatiblePlayUrl: string;
  thumbnailUrl: string | null;
};

type RecordingDiagnostics = {
  recordingId: string;
  fileExists: boolean;
  fileSizeBytes?: number;
  playableLikely: boolean;
  hasAudioStream?: boolean;
  audioPlayableLikely?: boolean;
  compatibleRecommended?: boolean;
  compatibleCached?: boolean;
  fragmentedLikely?: boolean;
  reason: string | null;
  format?: string | null;
  durationSeconds?: number | null;
  bitRate?: number | null;
  video?: {
    codec?: string | null;
    width?: number | null;
    height?: number | null;
    avgFrameRate?: string | null;
  } | null;
  audio?: {
    codec?: string | null;
    channels?: number | null;
    sampleRate?: number | null;
  } | null;
};

type RecordingDiagnosticsSummary = {
  recordingId: string;
  diagnostics: RecordingDiagnostics;
};

type RecordingHealthCamera = {
  cameraId: string;
  total: number;
  broken: number;
  tooSmall: number;
  compatibleRecommended: number;
  directLikely: number;
  withAudio: number;
  lastRecordingAt: string | null;
  lastRecordingAgeSeconds: number | null;
  needsAttention: boolean;
  alertReason: string | null;
};

type RecordingHealthSummary = {
  date: string;
  totalRecordings: number;
  camerasNeedingAttention: number;
  cameras: RecordingHealthCamera[];
};

type InvestigationOption = {
  id: string;
  title: string;
};

type ExportedClip = {
  id: string;
  sourceRecordingId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  sizeBytes: string | null;
  downloadUrl: string;
  investigationItemId: string | null;
};

const API_URL = getApiBaseUrl();
const SPEEDS = ['0.25x', '0.5x', '1x', '2x', '4x', '8x'];
const TOTAL_MINS = 24 * 60;
const API_TIMEOUT_MS = 20000;
const PLAYBACK_TIMEOUT_DIRECT_MS = 8000;
const PLAYBACK_TIMEOUT_COMPAT_MS = 150000; // 150s: FFmpeg HEVC→H264 pode levar até 120s na primeira execução

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function minuteOfDay(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function buildTimelineSegments(recordings: RecordingItem[], events: Array<{ timestamp: string; severity: string }>) {
  const recorded: TimelineSegment[] = recordings
    .map((recording) => ({
      recordingId: recording.id,
      start: clamp(minuteOfDay(recording.startedAt), 0, TOTAL_MINS),
      end: clamp(minuteOfDay(recording.endedAt ?? recording.startedAt), 0, TOTAL_MINS),
      type: (recording.fileUsable ?? recording.fileExists) ? 'recorded' as const : 'recorded_broken' as const,
    }))
    .filter((segment) => segment.end > segment.start)
    .sort((a, b) => a.start - b.start);

  const gaps: TimelineSegment[] = [];
  let cursor = 0;
  for (const segment of recorded) {
    if (segment.start > cursor) gaps.push({ start: cursor, end: segment.start, type: 'gap' });
    cursor = Math.max(cursor, segment.end);
  }
  if (cursor < TOTAL_MINS) gaps.push({ start: cursor, end: TOTAL_MINS, type: 'gap' });

  const eventMarkers: TimelineSegment[] = events.slice(0, 80).map((event) => {
    const point = clamp(minuteOfDay(event.timestamp), 0, TOTAL_MINS);
    return {
      start: Math.max(0, point - 0.6),
      end: Math.min(TOTAL_MINS, point + 0.6),
      type: event.severity === 'critical' ? 'alarm' : 'motion',
    };
  });

  return [...gaps, ...recorded, ...eventMarkers].sort((a, b) => a.start - b.start);
}

function authHeaders(accessToken: string | null) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
}

async function createPlaybackToken(recordingId: string, accessToken: string) {
  const { data } = await axios.post<{ playToken: string; expiresAt?: string | null }>(
    `${API_URL}/recordings/${recordingId}/play-token`,
    {},
    { headers: authHeaders(accessToken), withCredentials: true },
  );
  return data;
}

async function downloadRecording(recordingId: string, cameraCode: string, accessToken: string) {
  const response = await axios.get(`${API_URL}/recordings/${recordingId}/download`, {
    headers: authHeaders(accessToken),
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${cameraCode}-${recordingId}.mp4`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

async function downloadClip(downloadUrl: string, clipId: string, reason: string, accessToken: string) {
  const sep = downloadUrl.includes('?') ? '&' : '?';
  const response = await axios.get(`${API_URL}${downloadUrl}${sep}reason=${encodeURIComponent(reason)}`, {
    headers: authHeaders(accessToken),
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `clip-${clipId}.mp4`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export default function PlaybackPage() {
  const [location] = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const cameras = useVmsDataStore((state) => state.cameras);
  const events = useVmsDataStore((state) => state.events);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const client = useMemo(() => axios.create({ baseURL: API_URL, headers: authHeaders(accessToken), timeout: API_TIMEOUT_MS }), [accessToken]);

  const [selectedCamId, setSelectedCamId] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [speed, setSpeed] = useState('1x');
  const [playhead, setPlayhead] = useState(480);
  const [zoom, setZoom] = useState(1);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [loadingPlayback, setLoadingPlayback] = useState(false);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [downloadingRecordingId, setDownloadingRecordingId] = useState<string | null>(null);
  const [pendingSeekSeconds, setPendingSeekSeconds] = useState<number | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [compatMode, setCompatMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [diagnosticsByRecordingId, setDiagnosticsByRecordingId] = useState<Record<string, RecordingDiagnostics>>({});
  const [healthSummary, setHealthSummary] = useState<RecordingHealthSummary | null>(null);
  const [preparingCompatibleId, setPreparingCompatibleId] = useState<string | null>(null);
  const [investigations, setInvestigations] = useState<InvestigationOption[]>([]);
  const [selectedInvestigationId, setSelectedInvestigationId] = useState('__none__');
  const [clipStartSeconds, setClipStartSeconds] = useState<number | null>(null);
  const [clipEndSeconds, setClipEndSeconds] = useState<number | null>(null);
  const [exportingClip, setExportingClip] = useState(false);
  const [lastExportedClip, setLastExportedClip] = useState<ExportedClip | null>(null);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [videoZoom, setVideoZoom] = useState(1);
  const [videoPan, setVideoPan] = useState({ x: 0, y: 0 });
  const [draggingVideo, setDraggingVideo] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [jumpTime, setJumpTime] = useState('12:00:00');
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareCameraIds, setCompareCameraIds] = useState<string[]>([]);
  const [compareRecordingsByCamera, setCompareRecordingsByCamera] = useState<Record<string, RecordingItem[]>>({});
  const playbackReadyRef = useRef(false);
  const autoSkipTriedRef = useRef<Set<string>>(new Set());
  const playerColumnRef = useRef<HTMLDivElement | null>(null);
  // Estado do player (controles nativos do <video> ficam ocultos; usamos barra própria)
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(1);
  const [videoMuted, setVideoMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clipDownload, setClipDownload] = useState<{ url: string; clipId: string } | null>(null);
  const [clipDownloadReason, setClipDownloadReason] = useState('');

  const requestedCameraId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('cameraId');
  }, [location]);

  useEffect(() => {
    if (!cameras.length) return;
    if (requestedCameraId && cameras.some((camera) => camera.id === requestedCameraId)) {
      setSelectedCamId((current) => (current === requestedCameraId ? current : requestedCameraId));
      return;
    }
    if (!selectedCamId || !cameras.some((camera) => camera.id === selectedCamId)) {
      setSelectedCamId(cameras[0].id);
    }
  }, [cameras, requestedCameraId, selectedCamId]);

  useEffect(() => {
    if (!accessToken) return;
    void client.get<{ items: InvestigationOption[] }>('/investigations')
      .then(({ data }) => setInvestigations(Array.isArray(data.items) ? data.items.map((item) => ({ id: item.id, title: item.title })) : []))
      .catch(() => setInvestigations([]));
  }, [accessToken, client]);

  useEffect(() => {
    if (!accessToken || !selectedCamId) return;
    let cancelled = false;
    void client.get<{ items: RecordingItem[] }>(`/recordings?cameraId=${encodeURIComponent(selectedCamId)}&limit=1&sort=desc`, { timeout: API_TIMEOUT_MS })
      .then(({ data }) => {
        if (cancelled) return;
        const latest = Array.isArray(data.items) ? data.items[0] : null;
        if (latest) {
          const nextDate = format(new Date(latest.startedAt), 'yyyy-MM-dd');
          setSelectedDate((current) => current === nextDate ? current : nextDate);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken, client, selectedCamId]);

  useEffect(() => {
    if (!accessToken || !selectedCamId || !selectedDate) return;
    let cancelled = false;
    setLoadingRecordings(true);
    setLastExportedClip(null);
    setDiagnosticsByRecordingId({});

    void client
      .get<{ items: RecordingItem[] }>(`/recordings?cameraId=${encodeURIComponent(selectedCamId)}&date=${encodeURIComponent(selectedDate)}&limit=200&sort=asc`, { timeout: API_TIMEOUT_MS })
      .then(({ data }) => {
        if (cancelled) return;
        const items = Array.isArray(data.items) ? data.items : [];
        setRecordings(items);
        if (!items.length) {
          setSelectedRecordingId(null);
          setPlaybackUrl(null);
          setVideoError(null);
          return;
        }
        if (!items.some((item) => item.fileUsable ?? item.fileExists)) {
          setSelectedRecordingId(null);
          setPlaybackUrl(null);
          setVideoError('As gravações deste dia foram listadas, mas os arquivos estão ausentes, vazios ou incompletos no disco.');
          return;
        }
        setPlayhead(clamp(Math.round(minuteOfDay(items[items.length - 1].startedAt)), 0, TOTAL_MINS));
      })
      .catch((error) => {
        if (cancelled) return;
        setRecordings([]);
        toast({
          title: 'Falha ao carregar gravações',
          description: error instanceof Error ? error.message : 'Não foi possível carregar as gravações desta câmera.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingRecordings(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, client, selectedCamId, selectedDate]);

  useEffect(() => {
    if (!accessToken || !recordings.length) {
      setDiagnosticsByRecordingId({});
      return;
    }
    const ids = recordings.slice(0, 80).map((item) => item.id);
    let cancelled = false;
    void client.post<{ items: RecordingDiagnosticsSummary[] }>('/recordings/diagnostics/bulk', { recordingIds: ids, includeIntegrity: false })
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, RecordingDiagnostics> = {};
        for (const entry of Array.isArray(data.items) ? data.items : []) {
          if (entry?.recordingId && entry?.diagnostics) {
            map[entry.recordingId] = entry.diagnostics;
          }
        }
        setDiagnosticsByRecordingId(map);
      })
      .catch(() => {
        if (!cancelled) setDiagnosticsByRecordingId({});
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, client, recordings]);

  useEffect(() => {
    if (!accessToken || !selectedCamId || !selectedDate) {
      setHealthSummary(null);
      return;
    }
    let cancelled = false;
    void client.get<RecordingHealthSummary>(
      `/recordings/health-summary?cameraId=${encodeURIComponent(selectedCamId)}&date=${encodeURIComponent(selectedDate)}`,
      { timeout: API_TIMEOUT_MS },
    )
      .then(({ data }) => {
        if (!cancelled) setHealthSummary(data);
      })
      .catch(() => {
        if (!cancelled) setHealthSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, client, selectedCamId, selectedDate]);

  useEffect(() => {
    if (!compareEnabled || !accessToken || !selectedDate || !cameras.length) {
      setCompareRecordingsByCamera({});
      return;
    }
    const ids = Array.from(new Set([selectedCamId, ...compareCameraIds].filter(Boolean))).slice(0, 4);
    if (!ids.length) return;
    let cancelled = false;
    void Promise.all(ids.map(async (cameraId) => {
      const { data } = await client.get<{ items: RecordingItem[] }>(
        `/recordings?cameraId=${encodeURIComponent(cameraId)}&date=${encodeURIComponent(selectedDate)}&limit=200&sort=asc`,
        { timeout: API_TIMEOUT_MS },
      );
      return [cameraId, Array.isArray(data.items) ? data.items : []] as const;
    }))
      .then((entries) => {
        if (cancelled) return;
        setCompareRecordingsByCamera(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setCompareRecordingsByCamera({});
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, cameras.length, client, compareCameraIds, compareEnabled, selectedCamId, selectedDate]);

  const selectedCam = useMemo(() => cameras.find((camera) => camera.id === selectedCamId) ?? cameras[0] ?? null, [cameras, selectedCamId]);
  const selectedDay = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate]);
  const dayStart = useMemo(() => startOfDay(selectedDay), [selectedDay]);

  const relevantEvents = useMemo(
    () => events.filter((event) => event.cameraId === selectedCamId && isSameDay(new Date(event.timestamp), selectedDay)).slice(0, 40),
    [events, selectedCamId, selectedDay],
  );

  const timelineSegments = useMemo(() => buildTimelineSegments(recordings, relevantEvents), [recordings, relevantEvents]);
  const compareCameraItems = useMemo(() => (
    Array.from(new Set([selectedCamId, ...compareCameraIds].filter(Boolean)))
      .slice(0, 4)
      .map((cameraId) => cameras.find((camera) => camera.id === cameraId))
      .filter((camera): camera is NonNullable<typeof camera> => Boolean(camera))
  ), [cameras, compareCameraIds, selectedCamId]);

  const compareRows = useMemo(() => compareCameraItems.map((camera) => {
    const items = compareRecordingsByCamera[camera.id] ?? (camera.id === selectedCamId ? recordings : []);
    const eventsForCamera = events.filter((event) => event.cameraId === camera.id && isSameDay(new Date(event.timestamp), selectedDay)).slice(0, 40);
    const segments = buildTimelineSegments(items, eventsForCamera);
    const current = items.find((recording) => {
      const start = minuteOfDay(recording.startedAt);
      const end = minuteOfDay(recording.endedAt ?? recording.startedAt);
      return playhead >= start && playhead <= end;
    });
    return { camera, items, segments, current };
  }), [compareCameraItems, compareRecordingsByCamera, events, playhead, recordings, selectedCamId, selectedDay]);
  useEffect(() => {
    if (!recordings.length) {
      setSelectedRecordingId(null);
      setPlaybackUrl(null);
      setVideoError(null);
      return;
    }
    const playableRecordings = recordings.filter((recording) => recording.fileUsable ?? recording.fileExists);
    if (!playableRecordings.length) {
      setSelectedRecordingId(null);
      setPlaybackUrl(null);
      setVideoError('Nenhuma gravação utilizável foi encontrada no disco para esta data.');
      return;
    }
    const minuteTarget = playhead;
    const containing = playableRecordings.find((recording) => {
      const start = minuteOfDay(recording.startedAt);
      const end = minuteOfDay(recording.endedAt ?? recording.startedAt);
      return minuteTarget >= start && minuteTarget <= end;
    });
    const next = containing ?? playableRecordings.find((recording) => minuteOfDay(recording.startedAt) >= minuteTarget) ?? playableRecordings[0];
    setSelectedRecordingId((current) => (current === next.id ? current : next.id));
    const offsetMinutes = Math.max(0, minuteTarget - minuteOfDay(next.startedAt));
    setPendingSeekSeconds(offsetMinutes * 60);
  }, [recordings, playhead]);

  const selectedRecording = useMemo(() => recordings.find((recording) => recording.id === selectedRecordingId) ?? null, [recordings, selectedRecordingId]);
  const selectedDiagnostics = useMemo(() => (selectedRecordingId ? diagnosticsByRecordingId[selectedRecordingId] ?? null : null), [diagnosticsByRecordingId, selectedRecordingId]);
  const playbackMayUseCompatible = compatMode || Boolean(selectedDiagnostics?.compatibleRecommended);
  const recordingById = useMemo(() => new Map(recordings.map((recording) => [recording.id, recording] as const)), [recordings]);
  const selectedHealth = useMemo(() => healthSummary?.cameras.find((item) => item.cameraId === selectedCamId) ?? null, [healthSummary, selectedCamId]);

  useEffect(() => {
    if (!selectedRecordingId || !accessToken) {
      setPlaybackUrl(null);
      return;
    }
    if (!selectedRecording?.fileExists) {
      setPlaybackUrl(null);
      setVideoError('O arquivo desta gravação não existe mais no disco.');
      return;
    }
    if (selectedRecording.fileUsable === false) {
      setPlaybackUrl(null);
      setVideoError('O arquivo desta gravação existe, mas está vazio ou incompleto e não pode ser reproduzido.');
      return;
    }

    let cancelled = false;
    setLoadingPlayback(true);
    setVideoError(null);
    playbackReadyRef.current = false;

    void createPlaybackToken(selectedRecordingId, accessToken)
      .then((token) => {
        if (cancelled) return;
        const params = new URLSearchParams();
        if (compatMode) params.set('compatible', '1');
        if (token.playToken) params.set('token', token.playToken);
        params.set('v', String(reloadNonce));
        setPlaybackUrl(`${API_URL}/recordings/${selectedRecordingId}/play?${params.toString()}`);
      })
      .catch((error) => {
        if (cancelled) return;
        setPlaybackUrl(null);
      setVideoError(error instanceof Error ? error.message : 'Falha ao preparar reprodução.');
      })
      .finally(() => {
        if (!cancelled) setLoadingPlayback(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRecordingId, accessToken, compatMode, selectedRecording?.fileExists, selectedRecording?.fileUsable, reloadNonce]);

  useEffect(() => {
    setCompatMode(false);
    setReloadNonce(0);
    autoSkipTriedRef.current.clear();
  }, [selectedRecordingId]);

  useEffect(() => {
    if (!playbackUrl) return;
    playbackReadyRef.current = false;
    const timeout = window.setTimeout(() => {
      if (playbackReadyRef.current) return;
      if (!playbackMayUseCompatible) {
        setVideoError('A reprodução direta demorou além do esperado. Preparando versão compatível...');
        setCompatMode(true);
        return;
      }
      setVideoError('A transcodificação para modo compatível demorou mais que o esperado. Isso ocorre na primeira reprodução de vídeos HEVC (H.265). Aguarde e tente novamente — o arquivo já pode estar sendo processado.');
    }, playbackMayUseCompatible ? PLAYBACK_TIMEOUT_COMPAT_MS : PLAYBACK_TIMEOUT_DIRECT_MS);

    return () => window.clearTimeout(timeout);
  }, [playbackUrl, playbackMayUseCompatible]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const rate = Number(speed.replace('x', ''));
    video.playbackRate = Number.isFinite(rate) ? rate : 1;
  }, [speed, playbackUrl]);

  const syncVideoToPlayhead = useCallback(() => {
    if (!videoRef.current || pendingSeekSeconds == null) return;
    videoRef.current.currentTime = pendingSeekSeconds;
    setPendingSeekSeconds(null);
  }, [pendingSeekSeconds]);

  const currentTime = addMinutes(dayStart, playhead);
  const zoomedWindow = TOTAL_MINS / zoom;
  const viewStart = clamp(playhead - zoomedWindow / 2, 0, TOTAL_MINS - zoomedWindow);
  const viewEnd = clamp(viewStart + zoomedWindow, zoomedWindow, TOTAL_MINS);

  const setPlayheadFromMinute = useCallback((minute: number) => {
    setPlayhead(clamp(Math.round(minute), 0, TOTAL_MINS));
  }, []);

  const jumpToExactTime = useCallback(() => {
    const raw = jumpTime.trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      toast({ title: 'Hora inválida', description: 'Use o formato HH:mm ou HH:mm:ss.', variant: 'destructive' });
      return;
    }
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    const ss = Number(match[3] ?? '0');
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) {
      toast({ title: 'Hora inválida', description: 'Valores fora do intervalo válido.', variant: 'destructive' });
      return;
    }
    const minute = hh * 60 + mm + ss / 60;
    setPlayheadFromMinute(minute);
  }, [jumpTime, setPlayheadFromMinute]);

  const toggleCompareCamera = useCallback((cameraId: string) => {
    if (cameraId === selectedCamId) return;
    setCompareCameraIds((current) => {
      if (current.includes(cameraId)) return current.filter((id) => id !== cameraId);
      return [...current, cameraId].slice(0, 3);
    });
  }, [selectedCamId]);

  const onTimelineClick = (clientX: number, rect: DOMRect) => {
    const pct = (clientX - rect.left) / rect.width;
    const minute = viewStart + pct * (viewEnd - viewStart);
    setPlayheadFromMinute(minute);
  };

  const getSegmentColor = (type: TimelineSegment['type']) => {
    if (type === 'recorded') return 'hsl(150,60%,32%)';
    if (type === 'recorded_broken') return 'hsl(0,48%,36%)';
    if (type === 'motion') return 'hsl(35,95%,50%)';
    if (type === 'alarm') return 'hsl(0,72%,50%)';
    return 'hsl(var(--muted))';
  };

  // Lê a posição atual do vídeo no momento da ação (evita ler o ref durante o render).
  const getCurrentVideoSeconds = useCallback(
    () => videoRef.current?.currentTime ?? pendingSeekSeconds ?? 0,
    [pendingSeekSeconds],
  );
  const selectedRecordingDuration = selectedRecording?.durationSeconds ?? 0;
  const selectedRecordingStartLabel = selectedRecording ? format(new Date(selectedRecording.startedAt), 'HH:mm:ss') : '--';
  const selectedRecordingEndLabel = selectedRecording?.endedAt ? format(new Date(selectedRecording.endedAt), 'HH:mm:ss') : '--';

  const handleDownload = async (recording = selectedRecording) => {
    if (!recording || !selectedCam || !accessToken) return;
    setDownloadingRecordingId(recording.id);
    try {
      await downloadRecording(recording.id, selectedCam.code, accessToken);
    } catch (error) {
      toast({
        title: 'Falha no download',
        description: error instanceof Error ? error.message : 'Não foi possível baixar a gravação selecionada.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingRecordingId(null);
    }
  };

  const prepareCompatiblePlayback = useCallback(async () => {
    if (!selectedRecording || !accessToken) return;
    setPreparingCompatibleId(selectedRecording.id);
    try {
      const { data } = await client.post<{ diagnostics?: RecordingDiagnostics }>(
        `/recordings/${selectedRecording.id}/compatible/prepare`,
        {},
        { timeout: 180000 },
      );
      if (data.diagnostics) {
        setDiagnosticsByRecordingId((current) => ({
          ...current,
          [selectedRecording.id]: data.diagnostics!,
        }));
      }
      setRecordings((current) => current.map((item) => (
        item.id === selectedRecording.id ? { ...item, compatibleCached: true } : item
      )));
      setCompatMode(true);
      setReloadNonce((current) => current + 1);
      toast({ title: 'Reprodução compatível pronta', description: 'A gravação foi preparada para reprodução no navegador.' });
    } catch (error) {
      toast({
        title: 'Falha ao preparar reprodução',
        description: error instanceof Error ? error.message : 'Não foi possível preparar a gravação compatível.',
        variant: 'destructive',
      });
    } finally {
      setPreparingCompatibleId(null);
    }
  }, [accessToken, client, selectedRecording]);

  const exportClip = useCallback(async () => {
    if (!selectedRecording || !accessToken) return;
    if (clipStartSeconds == null || clipEndSeconds == null) {
      toast({ title: 'Marque o intervalo', description: 'Defina o início e o fim do clipe antes de exportar.', variant: 'destructive' });
      return;
    }
    if (clipEndSeconds <= clipStartSeconds) {
      toast({ title: 'Intervalo inválido', description: 'O fim do clipe precisa ser maior que o início.', variant: 'destructive' });
      return;
    }

    setExportingClip(true);
    try {
      const { data } = await client.post<ExportedClip>(`/recordings/${selectedRecording.id}/clips/export`, {
        startSeconds: Math.floor(clipStartSeconds),
        endSeconds: Math.ceil(clipEndSeconds),
        investigationId: selectedInvestigationId === '__none__' ? undefined : selectedInvestigationId,
        label: `Clipe - ${selectedCam?.name ?? 'Câmera'}`,
        notes: `Exportado da reprodução em ${new Date().toISOString()}`,
      });
      setLastExportedClip(data);
      toast({
        title: 'Clipe exportado',
        description: data.investigationItemId ? 'O clipe foi exportado e anexado ao caso.' : 'O clipe foi exportado com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Falha ao exportar clipe',
        description: error instanceof Error ? error.message : 'Não foi possível exportar o clipe.',
        variant: 'destructive',
      });
    } finally {
      setExportingClip(false);
    }
  }, [accessToken, clipEndSeconds, clipStartSeconds, client, selectedCam?.name, selectedInvestigationId, selectedRecording]);

  const saveBookmark = useCallback(async () => {
    if (selectedInvestigationId === '__none__') {
      toast({ title: 'Selecione um caso', description: 'Escolha um caso para salvar o marcador.', variant: 'destructive' });
      return;
    }
    if (!selectedRecording || !selectedCam) return;
    const ts = new Date(new Date(selectedRecording.startedAt).getTime() + Math.floor(getCurrentVideoSeconds()) * 1000);
    setSavingBookmark(true);
    try {
      await client.post(`/investigations/${selectedInvestigationId}/bookmarks`, {
        label: `Marcador ${selectedCam.name} @ ${format(ts, 'HH:mm:ss')}`,
        timestamp: ts.toISOString(),
        cameraId: selectedCam.id,
        cameraName: selectedCam.name,
        notes: 'Marcador criado na reprodução',
      });
      toast({ title: 'Marcador salvo', description: 'O marcador foi anexado à investigação.' });
    } catch (error) {
      toast({
        title: 'Falha ao salvar marcador',
        description: error instanceof Error ? error.message : 'Não foi possível salvar o marcador.',
        variant: 'destructive',
      });
    } finally {
      setSavingBookmark(false);
    }
  }, [client, getCurrentVideoSeconds, selectedCam, selectedInvestigationId, selectedRecording]);

  const resetVideoView = useCallback(() => {
    setVideoZoom(1);
    setVideoPan({ x: 0, y: 0 });
    setDraggingVideo(false);
    setDragStart(null);
  }, []);

  useEffect(() => {
    resetVideoView();
  }, [selectedRecordingId, resetVideoView]);

  const handleVideoWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY < 0 ? 0.12 : -0.12;
    setVideoZoom((current) => clamp(Number((current + delta).toFixed(2)), 1, 6));
    if (videoZoom <= 1 && delta < 0) {
      setVideoPan({ x: 0, y: 0 });
    }
  }, [videoZoom]);

  const lockPageScroll = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = 'hidden';
  }, []);

  const unlockPageScroll = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = '';
  }, []);

  // Só trava o scroll da página quando há zoom (>1), para permitir o pan/arraste do
  // vídeo. Sem zoom, passar o mouse sobre o vídeo não deve impedir rolar a página.
  useEffect(() => {
    if (videoZoom > 1) lockPageScroll();
    else unlockPageScroll();
  }, [videoZoom, lockPageScroll, unlockPageScroll]);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
  }, []);

  const formatClock = useCallback((totalSeconds: number) => {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
    const s = Math.floor(totalSeconds % 60);
    const m = Math.floor((totalSeconds / 60) % 60);
    const h = Math.floor(totalSeconds / 3600);
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }, []);

  const seekVideoTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = clamp(seconds, 0, Number.isFinite(video.duration) ? video.duration : seconds);
    video.currentTime = clamped;
    setVideoCurrentTime(clamped);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    const next = !videoMuted;
    setVideoMuted(next);
    if (video) video.muted = next;
  }, [videoMuted]);

  const changeVolume = useCallback((value: number) => {
    const next = clamp(value, 0, 1);
    setVideoVolume(next);
    const video = videoRef.current;
    if (video) {
      video.volume = next;
      const muted = next === 0;
      video.muted = muted;
      setVideoMuted(muted);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = playerColumnRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const onVideoDragStart = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (videoZoom <= 1) return;
    setDraggingVideo(true);
    setDragStart({ x: event.clientX - videoPan.x, y: event.clientY - videoPan.y });
  }, [videoPan.x, videoPan.y, videoZoom]);

  const onVideoDragMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!draggingVideo || !dragStart || videoZoom <= 1) return;
    setVideoPan({
      x: event.clientX - dragStart.x,
      y: event.clientY - dragStart.y,
    });
  }, [dragStart, draggingVideo, videoZoom]);

  const onVideoDragEnd = useCallback(() => {
    setDraggingVideo(false);
    setDragStart(null);
  }, []);

  const selectNextUsableRecording = useCallback((failedRecordingId: string) => {
    const idx = recordings.findIndex((item) => item.id === failedRecordingId);
    if (idx < 0) return false;

    for (let next = idx + 1; next < recordings.length; next += 1) {
      const item = recordings[next];
      if (!(item.fileUsable ?? item.fileExists)) continue;
      setSelectedRecordingId(item.id);
      setPlayheadFromMinute(minuteOfDay(item.startedAt));
      setPendingSeekSeconds(0);
      return true;
    }
    for (let prev = idx - 1; prev >= 0; prev -= 1) {
      const item = recordings[prev];
      if (!(item.fileUsable ?? item.fileExists)) continue;
      setSelectedRecordingId(item.id);
      setPlayheadFromMinute(minuteOfDay(item.startedAt));
      setPendingSeekSeconds(0);
      return true;
    }
    return false;
  }, [recordings, setPlayheadFromMinute]);

  const jumpToAdjacentUsableRecording = useCallback((direction: 'prev' | 'next') => {
    if (!recordings.length || !selectedRecordingId) return;
    const idx = recordings.findIndex((item) => item.id === selectedRecordingId);
    if (idx < 0) return;
    const step = direction === 'next' ? 1 : -1;
    for (let i = idx + step; i >= 0 && i < recordings.length; i += step) {
      const item = recordings[i];
      if (!(item.fileUsable ?? item.fileExists)) continue;
      setSelectedRecordingId(item.id);
      setPlayheadFromMinute(minuteOfDay(item.startedAt));
      setPendingSeekSeconds(0);
      return;
    }
    toast({
      title: 'Sem outro segmento válido',
      description: direction === 'next' ? 'Não há próximo segmento reproduzível.' : 'Não há segmento anterior reproduzível.',
      variant: 'destructive',
    });
  }, [recordings, selectedRecordingId, setPlayheadFromMinute]);

  const confirmClipDownload = useCallback(async () => {
    if (!clipDownload || !accessToken) return;
    const reason = clipDownloadReason.trim();
    if (!reason) return;
    const target = clipDownload;
    setClipDownload(null);
    try {
      await downloadClip(target.url, target.clipId, reason, accessToken);
    } catch (error) {
      toast({
        title: 'Falha no download do clipe',
        description: error instanceof Error ? error.message : 'Não foi possível baixar o clipe.',
        variant: 'destructive',
      });
    }
  }, [accessToken, clipDownload, clipDownloadReason]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="toolbar">
        <Select value={selectedCamId} onValueChange={setSelectedCamId}>
          <SelectTrigger className="h-9 w-[min(100%,300px)] text-xs">
            <SelectValue placeholder="Selecione uma câmera" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {cameras.map((camera) => (
              <SelectItem key={camera.id} value={camera.id} className="text-xs">
                {camera.code} — {camera.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          type="date"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          className="input"
          style={{ width: 170, height: 34, fontSize: 12 }}
        />

        <div style={{ flex: 1 }} />

        {/* Janela de zoom da timeline (24h/12h/6h) */}
        <div className="segment">
          {[1, 2, 4].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setZoom(value)}
              className={`seg-btn ${zoom === value ? 'active' : ''}`}
            >
              {value === 1 ? '24h' : value === 2 ? '12h' : '6h'}
            </button>
          ))}
        </div>

        {/* Recursos avançados ocultos para espelhar o mock (funcionalidade preservada) */}
        <div className="hidden">
          <input value={jumpTime} onChange={(event) => setJumpTime(event.target.value)} placeholder="HH:mm:ss" />
          <button type="button" onClick={jumpToExactTime}>Ir para hora</button>
          <button type="button" onClick={() => setCompareEnabled((value) => !value)}>Multi-câmera</button>
        </div>
      </div>

      {compareEnabled && (
        <div className="rounded-lg border border-border bg-card/70 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Reprodução multi-câmera</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">Até 4 câmeras sincronizadas por data e horário.</div>
            </div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">{compareCameraItems.length}/4 selecionadas</div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {cameras.map((camera) => {
              const active = compareCameraItems.some((item) => item.id === camera.id);
              const locked = camera.id === selectedCamId;
              return (
                <button
                  key={camera.id}
                  type="button"
                  onClick={() => toggleCompareCamera(camera.id)}
                  disabled={!locked && !active && compareCameraItems.length >= 4}
                  className={`rounded border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-40 ${active ? 'border-[hsl(var(--primary)_/_0.45)] bg-[hsl(var(--primary)_/_0.10)] text-[hsl(var(--primary))]' : 'border-border text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-foreground'}`}
                >
                  {camera.code || camera.name}{locked ? ' · principal' : ''}
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {compareRows.map(({ camera, segments, current }) => (
              <div key={camera.id} className="rounded-lg border border-border bg-background/55 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{camera.name}</div>
                    <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{current ? `${format(new Date(current.startedAt), 'HH:mm:ss')} - ${current.endedAt ? format(new Date(current.endedAt), 'HH:mm:ss') : '--'}` : 'Sem gravação neste horário'}</div>
                  </div>
                  <span className={`rounded px-2 py-1 text-[10px] ${current ? 'bg-[hsl(var(--status-online)_/_0.1)] text-[hsl(var(--status-online))]' : 'bg-white/5 text-[hsl(var(--muted-foreground))]'}`}>{current ? 'Disponível' : 'Vazio'}</span>
                </div>
                <div className="relative h-8 overflow-hidden rounded bg-[hsl(var(--muted))]" onClick={(event) => onTimelineClick(event.clientX, event.currentTarget.getBoundingClientRect())}>
                  {segments.filter((segment) => segment.end >= viewStart && segment.start <= viewEnd).map((segment, index) => {
                    const segStart = Math.max(segment.start, viewStart);
                    const segEnd = Math.min(segment.end, viewEnd);
                    const windowSize = viewEnd - viewStart;
                    return (
                      <div
                        key={`${camera.id}-${segment.type}-${index}-${segStart}`}
                        className="absolute top-0 h-full"
                        style={{
                          left: `${((segStart - viewStart) / windowSize) * 100}%`,
                          width: `${((segEnd - segStart) / windowSize) * 100}%`,
                          background: getSegmentColor(segment.type),
                        }}
                      />
                    );
                  })}
                  <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: `${((playhead - viewStart) / (viewEnd - viewStart)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="hidden">
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Segmentos</div>
          <div className="mt-1 text-lg font-semibold">{selectedHealth?.total ?? recordings.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Direto</div>
          <div className="mt-1 text-lg font-semibold">{selectedHealth?.directLikely ?? recordings.filter((item) => item.fileUsable ?? item.fileExists).length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Compatível</div>
          <div className="mt-1 text-lg font-semibold">{selectedHealth?.compatibleRecommended ?? Object.values(diagnosticsByRecordingId).filter((item) => item.compatibleRecommended).length}</div>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${
          selectedHealth?.needsAttention
            ? 'border-[hsl(var(--destructive)_/_0.3)] bg-[hsl(var(--destructive)_/_0.1)]'
            : 'border-border bg-card'
        }`}>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Saúde</div>
          <div className={`mt-1 text-sm font-semibold ${selectedHealth?.needsAttention ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--status-online))]'}`}>
            {selectedHealth?.needsAttention ? selectedHealth.alertReason ?? 'Atenção necessária' : 'Operacional'}
          </div>
        </div>
      </div>


      <div className="flex flex-1 gap-4 min-h-0 p-4">
        <div ref={playerColumnRef} className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="relative min-h-[62vh] flex-1 overflow-hidden rounded-xl border border-border bg-[hsl(210,18%,7%)]">
            <div className="camera-scanline absolute inset-0 overflow-hidden pointer-events-none" />

            <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
              <span className="rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-white/60">{selectedCam?.code ?? '—'}</span>
              <span className="rounded bg-black/50 px-2 py-1 text-[10px] text-white/65">Reprodução</span>
              {playing && <span className="rec-pulse h-2 w-2 rounded-full bg-[hsl(var(--destructive))]" />}
            </div>

            {playbackUrl ? (
              <div
                className={`h-full w-full overflow-hidden ${videoZoom > 1 ? (draggingVideo ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
                onWheel={handleVideoWheel}
                onWheelCapture={handleVideoWheel}
                onMouseDown={onVideoDragStart}
                onMouseMove={onVideoDragMove}
                onMouseUp={onVideoDragEnd}
                onMouseLeave={onVideoDragEnd}
                style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
              >
                <video
                  key={playbackUrl}
                  ref={videoRef}
                  src={playbackUrl}
                  crossOrigin="use-credentials"
                  preload="metadata"
                  className="h-full w-full bg-black object-contain"
                  style={{ transform: `translate(${videoPan.x}px, ${videoPan.y}px) scale(${videoZoom})`, transformOrigin: 'center center' }}
                  onClick={togglePlay}
                  onLoadedMetadata={() => {
                    playbackReadyRef.current = true;
                    const video = videoRef.current;
                    if (video) {
                      setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0);
                      video.volume = videoVolume;
                      video.muted = videoMuted;
                    }
                    syncVideoToPlayhead();
                  }}
                  onDurationChange={() => {
                    const video = videoRef.current;
                    if (video) setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0);
                  }}
                  onVolumeChange={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    setVideoVolume(video.volume);
                    setVideoMuted(video.muted);
                  }}
                  onCanPlay={() => {
                    playbackReadyRef.current = true;
                    setVideoError(null);
                  }}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onTimeUpdate={() => {
                    if (!selectedRecording || !videoRef.current) return;
                    setVideoCurrentTime(videoRef.current.currentTime);
                    const base = minuteOfDay(selectedRecording.startedAt);
                    const minute = base + videoRef.current.currentTime / 60;
                    setPlayhead(clamp(Math.round(minute), 0, TOTAL_MINS));
                  }}
                  onError={() => {
                    if (!playbackMayUseCompatible) {
                      setVideoError('Falha na reprodução direta. Preparando versão compatível...');
                      setCompatMode(true);
                      return;
                    }
                    if (selectedRecordingId && !autoSkipTriedRef.current.has(selectedRecordingId)) {
                      autoSkipTriedRef.current.add(selectedRecordingId);
                      const switched = selectNextUsableRecording(selectedRecordingId);
                      if (switched) {
                        setVideoError('Segmento atual falhou. Avançando automaticamente para o próximo trecho válido.');
                        return;
                      }
                    }
                    setVideoError('Falha ao carregar a gravação selecionada, mesmo em modo compatível.');
                  }}
                />
              </div>
            ) : null}

            {!playbackUrl && !loadingPlayback && !loadingRecordings && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  {recordings.length ? <CameraIcon className="mx-auto mb-2 h-10 w-10 text-white/10" /> : <VideoOff className="mx-auto mb-2 h-10 w-10 text-white/10" />}
                  <div className="text-xs text-white/30">
                    {recordings.length ? 'Selecione um ponto da timeline' : 'Sem gravações nesta data'}
                  </div>
                </div>
              </div>
            )}

            {(loadingPlayback || loadingRecordings) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/55 px-3 py-2 text-xs text-white/80">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {loadingRecordings ? 'Carregando gravações do dia' : compatMode && selectedRecording && !selectedRecording.compatibleCached ? 'Preparando gravação compatível' : 'Carregando gravação'}
                </div>
              </div>
            )}

            {videoError && !loadingPlayback && !loadingRecordings && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                <div className="rounded-lg border border-[hsl(var(--destructive)_/_0.3)] bg-[hsl(var(--destructive)_/_0.1)] px-4 py-3 text-center text-xs text-[hsl(var(--destructive))]">
                  <div>{videoError}</div>
                  <button
                    type="button"
                    onClick={() => {
                      playbackReadyRef.current = false;
                      setVideoError(null);
                      setReloadNonce((current) => current + 1);
                    }}
                    className="mt-2 rounded border border-[hsl(var(--destructive)_/_0.4)] px-2.5 py-1 text-[10px] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)_/_0.2)]"
                  >
                    Tentar novamente este segmento
                  </button>
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-3 left-3 z-10">
              <span className="rounded bg-black/50 px-2 py-1 text-sm text-white/75">{format(currentTime, 'dd/MM/yyyy HH:mm:ss')}</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="relative mb-2 h-9 cursor-pointer overflow-hidden rounded bg-[hsl(var(--muted))]" onClick={(event) => onTimelineClick(event.clientX, event.currentTarget.getBoundingClientRect())}>
              {timelineSegments.filter((segment) => segment.end >= viewStart && segment.start <= viewEnd).map((segment, index) => {
                const segStart = Math.max(segment.start, viewStart);
                const segEnd = Math.min(segment.end, viewEnd);
                const windowSize = viewEnd - viewStart;
                return (
                  <div
                    key={`${segment.type}-${index}-${segStart}`}
                    className="absolute top-0 h-full"
                    onClick={(event) => {
                      if ((segment.type !== 'recorded' && segment.type !== 'recorded_broken') || !segment.recordingId) return;
                      const rec = recordingById.get(segment.recordingId);
                      if (segment.type === 'recorded_broken' || !(rec?.fileUsable ?? rec?.fileExists)) {
                        toast({
                          title: 'Segmento indisponível',
                          description: 'Este trecho está ausente, incompleto ou corrompido no disco.',
                          variant: 'destructive',
                        });
                        return;
                      }
                      const recDiag = diagnosticsByRecordingId[segment.recordingId];
                      if (recDiag?.compatibleRecommended) {
                        setCompatMode(true);
                      }
                      event.stopPropagation();
                      setSelectedRecordingId(segment.recordingId);
                      setPendingSeekSeconds(0);
                      setPlayheadFromMinute(segment.start);
                    }}
                    style={{
                      left: `${((segStart - viewStart) / windowSize) * 100}%`,
                      width: `${((segEnd - segStart) / windowSize) * 100}%`,
                      background: getSegmentColor(segment.type),
                      cursor: segment.type === 'recorded' || segment.type === 'recorded_broken' ? 'pointer' : 'default',
                    }}
                  />
                );
              })}
              <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-lg" style={{ left: `${((playhead - viewStart) / (viewEnd - viewStart)) * 100}%` }}>
                <div className="absolute top-0 left-1/2 h-0 w-0 -translate-x-1/2 border-l-[4px] border-r-[4px] border-t-[6px] border-transparent border-t-white" />
              </div>
              {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                const minute = viewStart + pct * (viewEnd - viewStart);
                return (
                  <div key={pct} className="pointer-events-none absolute bottom-1 font-mono text-[9px] text-white/40" style={{ left: `${pct * 100}%`, transform: 'translateX(-50%)' }}>
                    {format(addMinutes(dayStart, minute), 'HH:mm')}
                  </div>
                );
              })}
            </div>

            <div className="mb-3 flex items-center gap-3">
              {[
                ['Gravado', 'recorded'],
                ['Movimento', 'motion'],
                ['Alarme', 'alarm'],
              ].map(([label, type]) => (
                <div key={type} className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: getSegmentColor(type as TimelineSegment['type']) }} />
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</span>
                </div>
              ))}
              <button type="button" onClick={() => void handleDownload()} disabled={!selectedRecording || downloadingRecordingId === selectedRecording?.id} className="ml-auto flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45">
                {downloadingRecordingId === selectedRecording?.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Baixar
              </button>
              {selectedDiagnostics?.compatibleRecommended && !selectedRecording?.compatibleCached && (
                <button
                  type="button"
                  onClick={() => void prepareCompatiblePlayback()}
                  disabled={!selectedRecording || preparingCompatibleId === selectedRecording.id}
                  className="flex items-center gap-1.5 rounded border border-[hsl(var(--primary)_/_0.35)] bg-[hsl(var(--primary)_/_0.08)] px-3 py-1.5 text-xs text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary)_/_0.14)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {preparingCompatibleId === selectedRecording?.id && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  Preparar compatível
                </button>
              )}
            </div>

            <details className="hidden mb-3 rounded-lg border border-border bg-background/55 p-3">
              <summary className="cursor-pointer text-xs font-semibold">
                <span className="inline-flex items-center gap-2">
                  <Scissors className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                  Exportar trecho
                </span>
              </summary>
              <div className="mt-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <Scissors className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                Intervalo do clipe
              </div>
              <div className="grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_240px_auto]">
                <button type="button" onClick={() => setClipStartSeconds(Math.floor(getCurrentVideoSeconds()))} disabled={!selectedRecording} className="rounded border border-border px-3 py-2 text-left text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-45">
                  <div className="font-medium">Marcar início</div>
                  <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{clipStartSeconds == null ? '--' : `${clipStartSeconds}s`}</div>
                </button>
                <button type="button" onClick={() => setClipEndSeconds(Math.ceil(getCurrentVideoSeconds()))} disabled={!selectedRecording} className="rounded border border-border px-3 py-2 text-left text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-45">
                  <div className="font-medium">Marcar fim</div>
                  <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{clipEndSeconds == null ? '--' : `${clipEndSeconds}s`}</div>
                </button>
                <div className="rounded border border-border px-3 py-2 text-xs">
                  <div className="font-medium">Janela de origem</div>
                  <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{selectedRecordingStartLabel} — {selectedRecordingEndLabel}</div>
                </div>
                <div className="rounded border border-border px-3 py-2 text-xs">
                  <div className="font-medium">Duração do clipe</div>
                  <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{clipStartSeconds != null && clipEndSeconds != null && clipEndSeconds > clipStartSeconds ? `${clipEndSeconds - clipStartSeconds}s` : '--'}</div>
                </div>
                <Select value={selectedInvestigationId} onValueChange={setSelectedInvestigationId}>
                  <SelectTrigger className="h-full min-h-[44px] text-xs">
                    <SelectValue placeholder="Anexar ao caso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs">Sem caso</SelectItem>
                    {investigations.map((item) => <SelectItem key={item.id} value={item.id} className="text-xs">{item.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button type="button" onClick={() => void exportClip()} disabled={!selectedRecording || exportingClip || selectedRecordingDuration <= 0} className="rounded border border-[hsl(var(--primary)_/_0.35)] bg-[hsl(var(--primary)_/_0.08)] px-3 py-2 text-xs text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)_/_0.12)] disabled:opacity-45">
                  {exportingClip ? <span className="inline-flex items-center gap-1.5"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Exportando</span> : 'Exportar'}
                </button>
                <button type="button" onClick={() => void saveBookmark()} disabled={!selectedRecording || selectedInvestigationId === '__none__' || savingBookmark} className="rounded border border-border px-3 py-2 text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-45">
                  {savingBookmark ? <span className="inline-flex items-center gap-1.5"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Salvando</span> : 'Salvar marcador'}
                </button>
              </div>
              {lastExportedClip && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs">
                  <span className="font-medium">Clipe pronto:</span>
                  <span className="font-mono text-[hsl(var(--muted-foreground))]">{lastExportedClip.id.slice(0, 8)}</span>
                  <button type="button" onClick={() => { setClipDownloadReason(''); setClipDownload({ url: lastExportedClip.downloadUrl, clipId: lastExportedClip.id }); }} className="rounded border border-border px-2.5 py-1 hover:bg-[hsl(var(--accent))]">Baixar clipe</button>
                  {lastExportedClip.investigationItemId && <span className="rounded bg-[hsl(var(--primary)_/_0.08)] px-2 py-1 text-[hsl(var(--primary))]">Anexado à investigação</span>}
                </div>
              )}
              </div>
            </details>

            {/* Barra de reprodução do segmento atual: scrubber + tempo */}
            <div className="mb-2 flex items-center gap-3">
              <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">{formatClock(videoCurrentTime)}</span>
              <input
                type="range"
                min={0}
                max={videoDuration || selectedRecordingDuration || 0}
                step={0.1}
                value={Math.min(videoCurrentTime, videoDuration || selectedRecordingDuration || 0)}
                onChange={(event) => seekVideoTo(Number(event.target.value))}
                disabled={!playbackUrl}
                aria-label="Posição no segmento"
                className="playback-scrubber h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[hsl(var(--muted))] accent-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="w-14 shrink-0 font-mono text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">{formatClock(videoDuration || selectedRecordingDuration)}</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Navegação entre segmentos */}
              <button type="button" onClick={() => jumpToAdjacentUsableRecording('prev')} disabled={!selectedRecordingId} title="Segmento anterior" className="flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-[10px] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground disabled:opacity-45">
                <SkipBack className="h-3.5 w-3.5" /> Seg.
              </button>

              {/* Transporte central */}
              <div className="mx-auto flex items-center gap-1.5">
                <button type="button" onClick={() => setPlayheadFromMinute(playhead - 15)} title="Voltar 15 min" className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground"><SkipBack className="h-4 w-4" /></button>
                <button type="button" onClick={() => seekVideoTo(getCurrentVideoSeconds() - 10)} disabled={!playbackUrl} title="Voltar 10s" className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground disabled:opacity-45"><StepBack className="h-4 w-4" /></button>
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={!playbackUrl}
                  title={playing ? 'Pausar' : 'Reproduzir'}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-45"
                >
                  {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                </button>
                <button type="button" onClick={() => seekVideoTo(getCurrentVideoSeconds() + 10)} disabled={!playbackUrl} title="Avançar 10s" className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground disabled:opacity-45"><StepForward className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPlayheadFromMinute(playhead + 15)} title="Avançar 15 min" className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground"><SkipForward className="h-4 w-4" /></button>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={toggleMute} title={videoMuted ? 'Ativar som' : 'Silenciar'} className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground">
                  {videoMuted || videoVolume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={videoMuted ? 0 : videoVolume}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  aria-label="Volume"
                  className="hidden h-1 w-20 cursor-pointer appearance-none rounded-full bg-[hsl(var(--muted))] accent-[hsl(var(--primary))] sm:block"
                />
              </div>

              {/* Velocidade */}
              <div className="ops-segment flex items-center gap-0.5">
                <FastForward className="ml-1 h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                {SPEEDS.map((item) => (
                  <button key={item} type="button" onClick={() => setSpeed(item)} className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] transition-colors ${speed === item ? 'ops-segment-active' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground'}`}>
                    {item}
                  </button>
                ))}
              </div>

              {/* Tela cheia */}
              <button type="button" onClick={toggleFullscreen} title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'} className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground">
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="hidden xl:flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-3 py-2.5">
            <span className="text-xs font-semibold">Gravações do dia</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {recordings.length ? [...recordings].reverse().map((item) => {
              const isSelected = item.id === selectedRecordingId;
              const usable = item.fileUsable ?? item.fileExists;
              const startLabel = format(new Date(item.startedAt), 'HH:mm:ss');
              const endLabel = item.endedAt ? format(new Date(item.endedAt), 'HH:mm:ss') : '--';
              const recDiag = diagnosticsByRecordingId[item.id];
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (!usable) return;
                    if (recDiag?.compatibleRecommended) setCompatMode(true);
                    setSelectedRecordingId(item.id);
                    setPendingSeekSeconds(0);
                    setPlayheadFromMinute(minuteOfDay(item.startedAt));
                  }}
                  className={`w-full px-3 py-2.5 text-left transition-colors ${
                    !usable ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
                  } ${
                    isSelected
                      ? 'bg-[hsl(var(--primary)_/_0.1)]'
                      : 'hover:bg-[hsl(var(--accent))]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-medium ${isSelected ? 'text-[hsl(var(--primary))]' : ''}`}>
                      {startLabel} - {endLabel}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDownload(item);
                        }}
                        disabled={!usable || downloadingRecordingId === item.id}
                        title="Baixar gravação"
                        className="flex h-6 w-6 items-center justify-center rounded border border-border text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {downloadingRecordingId === item.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      </button>
                      <span className={`h-2 w-2 rounded-full ${usable ? 'bg-[hsl(var(--status-online)_/_0.8)]' : 'bg-[hsl(var(--destructive)_/_0.8)]'}`} />
                    </div>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                    {item.durationSeconds ? `${item.durationSeconds}s` : '--'} · {Math.round(Number(item.sizeBytes || 0) / 1024 / 1024)} MB
                  </div>
                </div>
              );
            }) : (
              <div className="px-4 py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
                Sem gravações nesta data.
              </div>
            )}
          </div>
        </div>

      </div>

      <Dialog open={clipDownload !== null} onOpenChange={(open) => { if (!open) setClipDownload(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Baixar clipe</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Informe o motivo do download. Esta ação é registrada na auditoria.
          </p>
          <Input
            autoFocus
            value={clipDownloadReason}
            onChange={(event) => setClipDownloadReason(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void confirmClipDownload(); }}
            placeholder="Motivo do download (obrigatório)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setClipDownload(null)}>Cancelar</Button>
            <Button onClick={() => void confirmClipDownload()} disabled={!clipDownloadReason.trim()}>Baixar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
