import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from 'react';
import axios from 'axios';
import { useLocation } from 'wouter';
import {
  Archive,
  Bookmark,
  Camera as CameraIcon,
  Download,
  FastForward,
  LoaderCircle,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  VideoOff,
} from 'lucide-react';
import { addMinutes, format, isSameDay, startOfDay } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '../hooks/use-toast';
import { getApiBaseUrl } from '../lib/api-base';
import { useAuthStore } from '../store/authStore';
import { useVmsDataStore } from '../store/vmsDataStore';

type TimelineSegment = {
  recordingId?: string;
  start: number;
  end: number;
  type: 'recorded' | 'gap' | 'motion' | 'alarm';
};

type GravaçãoItem = {
  id: string;
  cameraId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  sizeBytes: string;
  playUrl: string;
  thumbnailUrl: string | null;
};

type InvestigaçãoOption = {
  id: string;
  title: string;
};

type ExportedClip = {
  id: string;
  sourceGravaçãoId: string;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function minuteOfDay(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function buildTimelineSegments(recordings: GravaçãoItem[], events: Array<{ timestamp: string; severity: string }>) {
  const recorded: TimelineSegment[] = recordings
    .map((recording) => ({
      recordingId: recording.id,
      start: clamp(minuteOfDay(recording.startedAt), 0, TOTAL_MINS),
      end: clamp(minuteOfDay(recording.endedAt ?? recording.startedAt), 0, TOTAL_MINS),
      type: 'recorded' as const,
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

async function createReproduçãoToken(recordingId: string, accessToken: string) {
  const { data } = await axios.post<{ playToken: string }>(
    `${API_URL}/recordings/${recordingId}/play-token`,
    {},
    { headers: authHeaders(accessToken) },
  );
  return data.playToken;
}

async function downloadGravação(recordingId: string, cameraCódigo: string, accessToken: string) {
  const response = await axios.get(`${API_URL}/recordings/${recordingId}/download`, {
    headers: authHeaders(accessToken),
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${cameraCódigo}-${recordingId}.mp4`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

async function downloadClip(downloadUrl: string, clipId: string, accessToken: string) {
  const response = await axios.get(`${API_URL}${downloadUrl}`, {
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

export default function ReproduçãoPage() {
  const [location] = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const cameras = useVmsDataStore((state) => state.cameras);
  const events = useVmsDataStore((state) => state.events);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const client = useMemo(() => axios.create({ baseURL: API_URL, headers: authHeaders(accessToken) }), [accessToken]);

  const [selectedCamId, setSelectedCamId] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [speed, setSpeed] = useState('1x');
  const [playhead, setPlayhead] = useState(480);
  const [zoom, setZoom] = useState(1);
  const [selectedGravaçãoId, setSelectedGravaçãoId] = useState<string | null>(null);
  const [playbackUrl, setReproduçãoUrl] = useState<string | null>(null);
  const [loadingReprodução, setLoadingReprodução] = useState(false);
  const [loadingGravaçãos, setLoadingGravaçãos] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pendingSeekSeconds, setPendingSeekSeconds] = useState<number | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [compatMode, setCompatMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recordings, setGravaçãos] = useState<GravaçãoItem[]>([]);
  const [investigations, setInvestigaçãos] = useState<InvestigaçãoOption[]>([]);
  const [selectedInvestigaçãoId, setSelectedInvestigaçãoId] = useState('__none__');
  const [clipStartSeconds, setClipStartSeconds] = useState<number | null>(null);
  const [clipEndSeconds, setClipEndSeconds] = useState<number | null>(null);
  const [exportingClip, setExportingClip] = useState(false);
  const [lastExportedClip, setLastExportedClip] = useState<ExportedClip | null>(null);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [videoZoom, setVideoZoom] = useState(1);
  const [videoPan, setVideoPan] = useState({ x: 0, y: 0 });
  const [draggingVideo, setDraggingVideo] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

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
    void client.get<{ items: InvestigaçãoOption[] }>('/investigations')
      .then(({ data }) => setInvestigaçãos(Array.isArray(data.items) ? data.items.map((item) => ({ id: item.id, title: item.title })) : []))
      .catch(() => setInvestigaçãos([]));
  }, [accessToken, client]);

  useEffect(() => {
    if (!accessToken || !selectedCamId) return;
    let cancelled = false;
    void client.get<{ items: GravaçãoItem[] }>(`/recordings?cameraId=${encodeURIComponent(selectedCamId)}&limit=1&sort=desc`)
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
    setLoadingGravaçãos(true);
    setLastExportedClip(null);

    void client
      .get<{ items: GravaçãoItem[] }>(`/recordings?cameraId=${encodeURIComponent(selectedCamId)}&date=${encodeURIComponent(selectedDate)}&limit=200&sort=asc`)
      .then(({ data }) => {
        if (cancelled) return;
        const items = Array.isArray(data.items) ? data.items : [];
        setGravaçãos(items);
        if (!items.length) {
          setSelectedGravaçãoId(null);
          setReproduçãoUrl(null);
          setVideoError(null);
          return;
        }
        setPlayhead(clamp(Math.round(minuteOfDay(items[items.length - 1].startedAt)), 0, TOTAL_MINS));
      })
      .catch((error) => {
        if (cancelled) return;
        setGravaçãos([]);
        toast({
          title: 'Falha ao carregar gravações',
          description: error instanceof Error ? error.message : 'Não foi possível carregar as gravações desta câmera.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingGravaçãos(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, client, selectedCamId, selectedDate]);

  const selectedCam = cameras.find((camera) => camera.id === selectedCamId) ?? cameras[0] ?? null;
  const selectedDay = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate]);
  const dayStart = useMemo(() => startOfDay(selectedDay), [selectedDay]);

  const relevantEventos = useMemo(
    () => events.filter((event) => event.cameraId === selectedCamId && isSameDay(new Date(event.timestamp), selectedDay)).slice(0, 40),
    [events, selectedCamId, selectedDay],
  );

  const timelineSegments = useMemo(() => buildTimelineSegments(recordings, relevantEventos), [recordings, relevantEventos]);

  useEffect(() => {
    if (!recordings.length) {
      setSelectedGravaçãoId(null);
      setReproduçãoUrl(null);
      setVideoError(null);
      return;
    }
    const minuteTarget = playhead;
    const containing = recordings.find((recording) => {
      const start = minuteOfDay(recording.startedAt);
      const end = minuteOfDay(recording.endedAt ?? recording.startedAt);
      return minuteTarget >= start && minuteTarget <= end;
    });
    const next = containing ?? recordings.find((recording) => minuteOfDay(recording.startedAt) >= minuteTarget) ?? recordings[0];
    setSelectedGravaçãoId((current) => (current === next.id ? current : next.id));
    const offsetMinutes = Math.max(0, minuteTarget - minuteOfDay(next.startedAt));
    setPendingSeekSeconds(offsetMinutes * 60);
  }, [recordings, playhead]);

  const selectedGravação = recordings.find((recording) => recording.id === selectedGravaçãoId) ?? null;

  useEffect(() => {
    if (!selectedGravaçãoId || !accessToken) {
      setReproduçãoUrl(null);
      return;
    }

    let cancelled = false;
    setLoadingReprodução(true);
    setVideoError(null);

    void createReproduçãoToken(selectedGravaçãoId, accessToken)
      .then((token) => {
        if (cancelled) return;
        const compatFlag = compatMode ? '&compatible=1' : '';
        setReproduçãoUrl(`${API_URL}/recordings/${selectedGravaçãoId}/play?token=${encodeURIComponent(token)}${compatFlag}`);
      })
      .catch((error) => {
        if (cancelled) return;
        setReproduçãoUrl(null);
        setVideoError(error instanceof Error ? error.message : 'Falha ao gerar token de playback.');
      })
      .finally(() => {
        if (!cancelled) setLoadingReprodução(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedGravaçãoId, accessToken, compatMode]);

  useEffect(() => {
    setCompatMode(false);
  }, [selectedGravaçãoId]);

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

  const onTimelineClick = (clientX: number, rect: DOMRect) => {
    const pct = (clientX - rect.left) / rect.width;
    const minute = viewStart + pct * (viewEnd - viewStart);
    setPlayheadFromMinute(minute);
  };

  const getSegmentColor = (type: TimelineSegment['type']) => {
    if (type === 'recorded') return 'hsl(150,60%,32%)';
    if (type === 'motion') return 'hsl(35,95%,50%)';
    if (type === 'alarm') return 'hsl(0,72%,50%)';
    return 'hsl(var(--muted))';
  };

  const currentVideoSeconds = videoRef.current?.currentTime ?? pendingSeekSeconds ?? 0;
  const selectedGravaçãoDuration = selectedGravação?.durationSeconds ?? 0;
  const selectedGravaçãoStartLabel = selectedGravação ? format(new Date(selectedGravação.startedAt), 'HH:mm:ss') : '--';
  const selectedGravaçãoEndLabel = selectedGravação?.endedAt ? format(new Date(selectedGravação.endedAt), 'HH:mm:ss') : '--';

  const handleDownload = async () => {
    if (!selectedGravação || !selectedCam || !accessToken) return;
    setDownloading(true);
    try {
      await downloadGravação(selectedGravação.id, selectedCam.code, accessToken);
    } catch (error) {
      toast({
        title: 'Falha no download',
        description: error instanceof Error ? error.message : 'Não foi possível baixar a gravação selecionada.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  const exportClip = useCallback(async () => {
    if (!selectedGravação || !accessToken) return;
    if (clipStartSeconds == null || clipEndSeconds == null) {
      toast({ title: 'Marque o intervalo', description: 'Defina o início e o fim do clip antes de exportar.', variant: 'destructive' });
      return;
    }
    if (clipEndSeconds <= clipStartSeconds) {
      toast({ title: 'Intervalo inválido', description: 'O fim do clip precisa ser maior que o início.', variant: 'destructive' });
      return;
    }

    setExportingClip(true);
    try {
      const { data } = await client.post<ExportedClip>(`/recordings/${selectedGravação.id}/clips/export`, {
        startSeconds: Math.floor(clipStartSeconds),
        endSeconds: Math.ceil(clipEndSeconds),
        investigationId: selectedInvestigaçãoId === '__none__' ? undefined : selectedInvestigaçãoId,
        label: `Clip — ${selectedCam?.name ?? 'Camera'}`,
        notes: `Exportado do playback em ${new Date().toISOString()}`,
      });
      setLastExportedClip(data);
      toast({
        title: 'Clip exportado',
        description: data.investigationItemId ? 'O clip foi exportado e anexado à investigation.' : 'O clip foi exportado com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Falha ao exportar clip',
        description: error instanceof Error ? error.message : 'Não foi possível exportar o clip.',
        variant: 'destructive',
      });
    } finally {
      setExportingClip(false);
    }
  }, [accessToken, clipEndSeconds, clipStartSeconds, client, selectedCam?.name, selectedInvestigaçãoId, selectedGravação]);

  const saveBookmark = useCallback(async () => {
    if (selectedInvestigaçãoId === '__none__') {
      toast({ title: 'Selecione uma investigation', description: 'Escolha uma investigation para salvar o bookmark.', variant: 'destructive' });
      return;
    }
    if (!selectedGravação || !selectedCam) return;
    const ts = new Date(new Date(selectedGravação.startedAt).getTime() + Math.floor(currentVideoSeconds) * 1000);
    setSavingBookmark(true);
    try {
      await client.post(`/investigations/${selectedInvestigaçãoId}/bookmarks`, {
        label: `Bookmark ${selectedCam.name} @ ${format(ts, 'HH:mm:ss')}`,
        timestamp: ts.toISOString(),
        cameraId: selectedCam.id,
        cameraName: selectedCam.name,
        notes: 'Bookmark criado no playback',
      });
      toast({ title: 'Marcador salvo', description: 'O marcador foi anexado à investigação.' });
    } catch (error) {
      toast({
        title: 'Falha ao salvar bookmark',
        description: error instanceof Error ? error.message : 'Não foi possível salvar o bookmark.',
        variant: 'destructive',
      });
    } finally {
      setSavingBookmark(false);
    }
  }, [client, currentVideoSeconds, selectedCam, selectedInvestigaçãoId, selectedGravação]);

  const resetVideoView = useCallback(() => {
    setVideoZoom(1);
    setVideoPan({ x: 0, y: 0 });
    setDraggingVideo(false);
    setDragStart(null);
  }, []);

  useEffect(() => {
    resetVideoView();
  }, [selectedGravaçãoId, resetVideoView]);

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

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 shadow-sm">
        <Select value={selectedCamId} onValueChange={setSelectedCamId}>
          <SelectTrigger className="h-10 w-[min(100%,320px)] text-xs">
            <SelectValue placeholder="Selecione uma câmera" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {cameras.map((camera) => (
              <SelectItem key={camera.id} value={camera.id} className="text-xs font-mono">
                {camera.code} — {camera.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          type="date"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          className="h-10 rounded-xl border border-border bg-card px-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
        />

        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">Zoom:</span>
          {[1, 2, 4].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setZoom(value)}
              className={`rounded px-2.5 py-1.5 text-xs font-mono transition-colors ${zoom === value ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-border text-[hsl(var(--muted-foreground))] hover:text-foreground'}`}
            >
              {value === 1 ? '24h' : value === 2 ? '12h' : '6h'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-[20px] border border-border bg-[hsl(210,18%,7%)]">
            <div className="camera-scanline absolute inset-0 overflow-hidden pointer-events-none" />

            <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
              <span className="rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-white/60">{selectedCam?.code ?? '—'}</span>
              <span className="rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-white/60">PLAYBACK</span>
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
                onMouseEnter={lockPageScroll}
                onMouseOut={unlockPageScroll}
                style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
              >
                <video
                  key={playbackUrl}
                  ref={videoRef}
                  src={playbackUrl}
                  className="h-full w-full bg-black object-contain"
                  style={{ transform: `translate(${videoPan.x}px, ${videoPan.y}px) scale(${videoZoom})`, transformOrigin: 'center center' }}
                  controls
                  onLoadedMetadata={syncVideoToPlayhead}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onTimeUpdate={() => {
                    if (!selectedGravação || !videoRef.current) return;
                    const base = minuteOfDay(selectedGravação.startedAt);
                    const minute = base + videoRef.current.currentTime / 60;
                    setPlayhead(clamp(Math.round(minute), 0, TOTAL_MINS));
                  }}
                  onError={() => {
                    if (!compatMode) {
                      setCompatMode(true);
                      setVideoError('Tentando modo compatível de reprodução...');
                      return;
                    }
                    setVideoError('Falha ao carregar a gravação selecionada, mesmo em modo compatível.');
                  }}
                />
              </div>
            ) : null}

            {!playbackUrl && !loadingReprodução && !loadingGravaçãos && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  {recordings.length ? <CameraIcon className="mx-auto mb-2 h-10 w-10 text-white/10" /> : <VideoOff className="mx-auto mb-2 h-10 w-10 text-white/10" />}
                  <div className="font-mono text-xs text-white/25">
                    {recordings.length ? 'Selecione um ponto da timeline' : 'Sem gravações nesta data'}
                  </div>
                </div>
              </div>
            )}

            {(loadingReprodução || loadingGravaçãos) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/55 px-3 py-2 text-xs text-white/80">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {loadingGravaçãos ? 'Carregando gravações do dia' : 'Carregando gravação'}
                </div>
              </div>
            )}

            {videoError && !loadingReprodução && !loadingGravaçãos && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-xs text-red-200">
                  {videoError}
                </div>
              </div>
            )}

            <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between gap-3">
              <span className="rounded bg-black/50 px-2 py-1 font-mono text-sm text-white/70">{format(currentTime, 'yyyy-MM-dd HH:mm:ss')}</span>
              <span className="rounded bg-black/50 px-2 py-1 font-mono text-xs text-white/50">
                {speed} · zoom {videoZoom.toFixed(2)}x · {selectedGravação ? `segmento ${selectedGravação.id.slice(0, 8)}` : 'sem segmento'}
              </span>
            </div>
          </div>

          <div className="rounded-[18px] border border-border bg-card p-3">
            <div className="relative mb-2 h-4 cursor-pointer overflow-hidden rounded bg-[hsl(var(--muted))]" onClick={(event) => onTimelineClick(event.clientX, event.currentTarget.getBoundingClientRect())}>
              {timelineSegments.map((segment, index) => (
                <div
                  key={`${segment.type}-${segment.start}-${index}`}
                  className="absolute top-0 h-full opacity-70"
                  style={{
                    left: `${(segment.start / TOTAL_MINS) * 100}%`,
                    width: `${((segment.end - segment.start) / TOTAL_MINS) * 100}%`,
                    background: getSegmentColor(segment.type),
                  }}
                />
              ))}
              <div className="pointer-events-none absolute top-0 h-full border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_0.1)]" style={{ left: `${(viewStart / TOTAL_MINS) * 100}%`, width: `${((viewEnd - viewStart) / TOTAL_MINS) * 100}%` }} />
              <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: `${(playhead / TOTAL_MINS) * 100}%` }} />
            </div>

            <div className="relative mb-2 h-12 cursor-pointer overflow-hidden rounded bg-[hsl(var(--muted))]" onClick={(event) => onTimelineClick(event.clientX, event.currentTarget.getBoundingClientRect())}>
              {timelineSegments.filter((segment) => segment.end >= viewStart && segment.start <= viewEnd).map((segment, index) => {
                const segStart = Math.max(segment.start, viewStart);
                const segEnd = Math.min(segment.end, viewEnd);
                const windowSize = viewEnd - viewStart;
                return (
                  <div
                    key={`${segment.type}-${index}-${segStart}`}
                    className="absolute top-0 h-full"
                    style={{
                      left: `${((segStart - viewStart) / windowSize) * 100}%`,
                      width: `${((segEnd - segStart) / windowSize) * 100}%`,
                      background: getSegmentColor(segment.type),
                    }}
                  />
                );
              })}
              <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-lg" style={{ left: `${((playhead - viewStart) / (viewEnd - viewStart)) * 100}%` }}>
                <div className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-l-[4px] border-r-[4px] border-t-[6px] border-transparent border-t-white" />
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
                ['Sem dados', 'gap'],
              ].map(([label, type]) => (
                <div key={type} className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: getSegmentColor(type as TimelineSegment['type']) }} />
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</span>
                </div>
              ))}
              <button type="button" onClick={handleDownload} disabled={!selectedGravação || downloading} className="ml-auto flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45">
                {downloading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Download Gravação
              </button>
            </div>

            <div className="mb-3 rounded-xl border border-border bg-background/55 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <Scissors className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                Exportação de clip por intervalo real
              </div>
              <div className="grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_240px_auto]">
                <button type="button" onClick={() => setClipStartSeconds(Math.floor(currentVideoSeconds))} disabled={!selectedGravação} className="rounded border border-border px-3 py-2 text-left text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-45">
                  <div className="font-medium">Marcar início</div>
                  <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{clipStartSeconds == null ? '--' : `${clipStartSeconds}s`}</div>
                </button>
                <button type="button" onClick={() => setClipEndSeconds(Math.ceil(currentVideoSeconds))} disabled={!selectedGravação} className="rounded border border-border px-3 py-2 text-left text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-45">
                  <div className="font-medium">Marcar fim</div>
                  <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{clipEndSeconds == null ? '--' : `${clipEndSeconds}s`}</div>
                </button>
                <div className="rounded border border-border px-3 py-2 text-xs">
                  <div className="font-medium">Janela de origem</div>
                  <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{selectedGravaçãoStartLabel} — {selectedGravaçãoEndLabel}</div>
                </div>
                <div className="rounded border border-border px-3 py-2 text-xs">
                  <div className="font-medium">Duração do clip</div>
                  <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{clipStartSeconds != null && clipEndSeconds != null && clipEndSeconds > clipStartSeconds ? `${clipEndSeconds - clipStartSeconds}s` : '--'}</div>
                </div>
                <Select value={selectedInvestigaçãoId} onValueChange={setSelectedInvestigaçãoId}>
                  <SelectTrigger className="h-full min-h-[44px] text-xs">
                    <SelectValue placeholder="Anexar à investigation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs">Sem investigation</SelectItem>
                    {investigations.map((item) => <SelectItem key={item.id} value={item.id} className="text-xs">{item.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button type="button" onClick={() => void exportClip()} disabled={!selectedGravação || exportingClip || selectedGravaçãoDuration <= 0} className="rounded border border-[hsl(var(--primary)_/_0.35)] bg-[hsl(var(--primary)_/_0.08)] px-3 py-2 text-xs text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)_/_0.12)] disabled:opacity-45">
                  {exportingClip ? <span className="inline-flex items-center gap-1.5"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Exportando</span> : 'Exportar Clip'}
                </button>
                <button type="button" onClick={() => void saveBookmark()} disabled={!selectedGravação || selectedInvestigaçãoId === '__none__' || savingBookmark} className="rounded border border-border px-3 py-2 text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-45">
                  {savingBookmark ? <span className="inline-flex items-center gap-1.5"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Salvando</span> : 'Salvar Marcador'}
                </button>
              </div>
              {lastExportedClip && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-xs">
                  <span className="font-medium">Clip pronto:</span>
                  <span className="font-mono text-[hsl(var(--muted-foreground))]">{lastExportedClip.id.slice(0, 8)}</span>
                  <button type="button" onClick={() => void downloadClip(lastExportedClip.downloadUrl, lastExportedClip.id, accessToken!)} className="rounded border border-border px-2.5 py-1 hover:bg-[hsl(var(--accent))]">Baixar Clip</button>
                  {lastExportedClip.investigationItemId && <span className="rounded bg-[hsl(var(--primary)_/_0.08)] px-2 py-1 text-[hsl(var(--primary))]">Anexado à investigação</span>}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2">
              <button type="button" onClick={() => setPlayheadFromMinute(playhead - 15)} className="flex h-8 w-8 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground"><SkipBack className="h-4 w-4" /></button>
              <button type="button" onClick={() => setPlayheadFromMinute(playhead - 1)} className="flex h-8 w-8 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground"><StepBack className="h-4 w-4" /></button>
              <button
                type="button"
                onClick={() => {
                  if (!videoRef.current) return;
                  if (videoRef.current.paused) {
                    void videoRef.current.play();
                  } else {
                    videoRef.current.pause();
                  }
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <button type="button" onClick={() => setPlayheadFromMinute(playhead + 1)} className="flex h-8 w-8 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground"><StepForward className="h-4 w-4" /></button>
              <button type="button" onClick={() => setPlayheadFromMinute(playhead + 15)} className="flex h-8 w-8 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground"><SkipForward className="h-4 w-4" /></button>

              <div className="ml-4 flex items-center gap-0.5">
                <FastForward className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                {SPEEDS.map((item) => (
                  <button key={item} type="button" onClick={() => setSpeed(item)} className={`rounded px-2 py-1 font-mono text-[10px] transition-colors ${speed === item ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-foreground'}`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-[18px] border border-border bg-card">
          <div className="border-b border-border px-3 py-2.5">
            <span className="text-xs font-semibold">Eventos, bookmarks e segmentos</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {selectedGravação && (
              <div className="px-3 py-3 bg-[hsl(var(--primary)_/_0.05)]">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  <Archive className="h-3 w-3" /> Segmento ativo
                </div>
                <div className="text-[11px] font-medium">{selectedCam?.name}</div>
                <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{selectedGravaçãoStartLabel} — {selectedGravaçãoEndLabel}</div>
                <div className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{(Number(selectedGravação.sizeBytes || 0) / 1024 / 1024).toFixed(1)} MB</div>
              </div>
            )}

            <button type="button" onClick={() => setClipStartSeconds(Math.floor(currentVideoSeconds))} disabled={!selectedGravação} className="w-full px-3 py-3 text-left transition-colors hover:bg-[hsl(var(--accent))] disabled:opacity-45">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <Bookmark className="h-3 w-3" /> Marcador Início
              </div>
              <div className="mt-1 font-mono text-[11px]">{clipStartSeconds == null ? 'Definir inicio do clip' : `${clipStartSeconds}s dentro do segmento`}</div>
            </button>

            <button type="button" onClick={() => setClipEndSeconds(Math.ceil(currentVideoSeconds))} disabled={!selectedGravação} className="w-full px-3 py-3 text-left transition-colors hover:bg-[hsl(var(--accent))] disabled:opacity-45">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <Bookmark className="h-3 w-3" /> Marcador Fim
              </div>
              <div className="mt-1 font-mono text-[11px]">{clipEndSeconds == null ? 'Definir fim do clip' : `${clipEndSeconds}s dentro do segmento`}</div>
            </button>

            {relevantEventos.length > 0 ? relevantEventos.map((event) => (
              <div key={event.id} className="cursor-pointer px-3 py-2.5 transition-colors hover:bg-[hsl(var(--accent))]" onClick={() => setPlayheadFromMinute(minuteOfDay(event.timestamp))}>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${event.severity === 'critical' ? 'status-alarm' : event.severity === 'warning' ? 'status-motion' : 'status-online'}`} />
                  <span className="truncate text-[10px] font-medium capitalize">{event.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="mt-0.5 font-mono text-[9px] text-[hsl(var(--muted-foreground))]">{format(new Date(event.timestamp), 'HH:mm:ss')}</div>
              </div>
            )) : (
              <div className="flex h-24 items-center justify-center px-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
                Sem eventos para esta câmera nesta data.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
