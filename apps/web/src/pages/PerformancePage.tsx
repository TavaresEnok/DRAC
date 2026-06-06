import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Camera, CheckCircle2, Clock, Cpu, HardDrive, Radio, RefreshCw, Router, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getApiBaseUrl } from '@/lib/api-base';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/use-toast';

type Severity = 'info' | 'warning' | 'critical';
type RiskLevel = 'ok' | 'attention' | 'high' | 'critical';

type ResourceFinding = {
  code: string;
  severity: Severity;
  message: string;
  action: string;
};

type ResourceCamera = {
  cameraId: string;
  cameraName: string;
  status: string;
  profiles: {
    live: {
      source: string;
      channel: number;
      subtype: number;
      protocol: string;
      codec?: string | null;
      width?: number | null;
      height?: number | null;
      fps?: number | null;
      bitrateKbps?: number | null;
      transcodeForBrowser: boolean;
      audioForcesTranscode: boolean;
      deliveryCodec?: string | null;
    };
    recording: {
      source: string;
      channel: number;
      subtype: number;
      codec?: string | null;
      width?: number | null;
      height?: number | null;
      fps?: number | null;
      enabled: boolean;
      mode?: string | null;
      copyFriendly: boolean;
    };
    analytics: {
      source: string;
      channel: number;
      subtype: number;
      codec?: string | null;
      separatedFromLive: boolean;
      usesMediaMtx: boolean;
      audioRequested: boolean;
    };
  };
  mediaMtx: {
    pathName: string;
    available: boolean;
    ready: boolean;
    readerCount: number;
    error?: string | null;
  };
  playback: {
    originalCodec?: string | null;
    browserNativeLikely: boolean;
    compatibilityCacheRecommended: boolean;
  };
  operations: {
    live: {
      failuresLast24h: number;
      lastFailureAt?: string | null;
      lastFailure?: {
        protocol?: string | null;
        stage?: string | null;
        reason?: string | null;
        state?: string | null;
      } | null;
    };
    recording: {
      state: string;
      segmentsLast24h: number;
      activeSegments: number;
      coveragePercentLast24h: number;
      coveredSecondsLast24h: number;
      gapSecondsLast24h: number;
      largestGapSecondsLast24h: number;
      usableSegmentsLast24h: number;
      lastSegmentAt?: string | null;
      lastSegmentAgeMs?: number | null;
    };
    playback: {
      state: string;
      lastPlayableCandidateAt?: string | null;
    };
  };
  resource: {
    level: RiskLevel;
    score: number;
    findings: ResourceFinding[];
    cpuHotspots: string[];
  };
};

type PerformanceReport = {
  generatedAt: string;
  summary: {
    totalCameras: number;
    onlineCameras: number;
    webrtcPreferred: number;
    analyticsSeparated: number;
    liveTranscodeLikely: number;
    audioTranscodeLikely: number;
    highCpuRiskCameras: number;
    playbackCompatibilityRisk: number;
    mediaMtxReaders: number;
    liveFailuresLast24h: number;
    recordingSegmentsLast24h: number;
    recordingGapSecondsLast24h: number;
    camerasWithRecordingAttention: number;
    warningCount: number;
    criticalCount: number;
  };
  cameras: ResourceCamera[];
  optimizationPlan: {
    safeActionCount: number;
    manualActionCount: number;
    canApplySafely: boolean;
  };
  recommendations: Array<ResourceFinding & { cameras: string[] }>;
};

const API_URL = getApiBaseUrl();

function levelLabel(level: RiskLevel) {
  if (level === 'critical') return 'Crítico';
  if (level === 'high') return 'Alto';
  if (level === 'attention') return 'Atenção';
  return 'OK';
}

function severityTone(severity: Severity) {
  if (severity === 'critical') return 'border-[hsl(var(--destructive)_/_0.35)] bg-[hsl(var(--destructive)_/_0.08)] text-[hsl(var(--destructive))]';
  if (severity === 'warning') return 'border-[hsl(var(--chart-4)_/_0.35)] bg-[hsl(var(--chart-4)_/_0.10)] text-[hsl(var(--chart-4))]';
  return 'border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_0.45)] text-[hsl(var(--muted-foreground))]';
}

function riskTone(level: RiskLevel) {
  if (level === 'critical') return 'text-[hsl(var(--destructive))]';
  if (level === 'high') return 'text-[hsl(var(--chart-4))]';
  if (level === 'attention') return 'text-[hsl(var(--primary))]';
  return 'text-[hsl(var(--chart-2))]';
}

function codecLabel(codec?: string | null) {
  const value = String(codec ?? '').toLowerCase();
  if (!value) return 'sem dado';
  if (value.includes('265') || value.includes('hevc')) return 'H.265';
  if (value.includes('264') || value.includes('avc')) return 'H.264';
  return value.toUpperCase();
}

function resolution(width?: number | null, height?: number | null) {
  if (!width || !height) return 'sem resolução';
  return `${width}x${height}`;
}

function durationLabel(seconds?: number | null) {
  const value = Math.max(0, Number(seconds ?? 0));
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)}min`;
  return `${(value / 3600).toFixed(value >= 10 * 3600 ? 0 : 1)}h`;
}

function dateTimeLabel(value?: string | null) {
  if (!value) return 'sem leitura';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sem leitura';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function riskSummaryLabel(summary?: PerformanceReport['summary']) {
  if (!summary) return 'Aguardando diagnóstico';
  if (summary.criticalCount > 0) return `${summary.criticalCount} crítico(s)`;
  if (summary.warningCount > 0) return `${summary.warningCount} alerta(s)`;
  return 'Operação estável';
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="ops-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-normal text-foreground">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[hsl(var(--primary)_/_0.16)] bg-[hsl(var(--primary)_/_0.10)] text-[hsl(var(--primary))]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 min-h-4 truncate text-[11px] text-[hsl(var(--muted-foreground))]">{detail}</p>
    </div>
  );
}

export default function PerformancePage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void axios.get(`${API_URL}/camera-stream/resource-diagnostics`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(({ data }) => {
      if (!cancelled) setReport(data);
    }).catch((err) => {
      if (cancelled) return;
      const message = axios.isAxiosError(err) ? (err.response?.data?.message ?? err.message) : 'Falha ao carregar desempenho.';
      setError(Array.isArray(message) ? message.join(' | ') : String(message));
      setReport(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [accessToken, nonce]);

  const orderedCameras = useMemo(() => {
    const order: Record<RiskLevel, number> = { critical: 0, high: 1, attention: 2, ok: 3 };
    return [...(report?.cameras ?? [])].sort((a, b) => order[a.resource.level] - order[b.resource.level] || a.cameraName.localeCompare(b.cameraName));
  }, [report?.cameras]);

  const summary = report?.summary;
  const isAdmin = user?.role === 'admin';

  async function applySafeOptimizations() {
    if (!accessToken || !isAdmin || !report?.optimizationPlan?.canApplySafely) return;
    setConfirmApplyOpen(false);
    setApplying(true);
    setError(null);
    try {
      await axios.post(`${API_URL}/camera-stream/optimization/apply-safe`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      toast({ title: 'Ajustes seguros aplicados', description: 'O diagnóstico foi atualizado com a nova configuração.' });
      setNonce((value) => value + 1);
    } catch (err) {
      const message = axios.isAxiosError(err) ? (err.response?.data?.message ?? err.message) : 'Falha ao aplicar otimização segura.';
      setError(Array.isArray(message) ? message.join(' | ') : String(message));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-[hsl(var(--border)_/_0.65)] pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ops-chip">
              <Activity className="h-3 w-3" />
              Diagnóstico
            </span>
            <span className="ops-chip">
              <AlertTriangle className="h-3 w-3" />
              {riskSummaryLabel(summary)}
            </span>
            <span className="ops-chip">
              <Clock className="h-3 w-3" />
              {dateTimeLabel(report?.generatedAt)}
            </span>
          </div>
          <div>
            <h2 className="text-[20px] font-semibold tracking-normal text-foreground">Desempenho operacional</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
              Streaming, gravação, playback e custo por câmera, com recomendações acionáveis para reduzir transcode e risco operacional.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setNonce((value) => value + 1)} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-3.5 w-3.5', loading && 'animate-spin')} />
            Atualizar
          </Button>
          {isAdmin && report?.optimizationPlan?.canApplySafely && (
            <Button size="sm" onClick={() => setConfirmApplyOpen(true)} disabled={applying}>
              <CheckCircle2 className={cn('mr-2 h-3.5 w-3.5', applying && 'animate-pulse')} />
              Ajustar seguro
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[hsl(var(--destructive)_/_0.35)] bg-[hsl(var(--destructive)_/_0.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={Camera} label="Câmeras online" value={summary ? `${summary.onlineCameras}/${summary.totalCameras}` : '-'} detail={`${summary?.webrtcPreferred ?? 0} com WebRTC como padrão`} />
        <StatCard icon={Cpu} label="Transcode live" value={summary?.liveTranscodeLikely ?? '-'} detail={`${summary?.audioTranscodeLikely ?? 0} com áudio convertendo para Opus`} />
        <StatCard icon={Radio} label="Falhas de live" value={summary?.liveFailuresLast24h ?? '-'} detail="Últimas 24 horas" />
        <StatCard icon={Router} label="Ajustes seguros" value={report?.optimizationPlan?.safeActionCount ?? '-'} detail={`${report?.optimizationPlan?.manualActionCount ?? 0} ação(ões) manuais sugeridas`} />
        <StatCard icon={HardDrive} label="Gaps gravação" value={durationLabel(summary?.recordingGapSecondsLast24h)} detail={`${summary?.camerasWithRecordingAttention ?? 0} câmera(s) em atenção`} />
        <StatCard icon={Video} label="Segmentos 24h" value={summary?.recordingSegmentsLast24h ?? '-'} detail={`${summary?.mediaMtxReaders ?? 0} leitor(es) MediaMTX`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="ops-card overflow-hidden">
          <div className="ops-toolbar border-b border-[hsl(var(--border))] px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--primary))]" />
              Recomendações
            </div>
          </div>
          <div className="divide-y divide-[hsl(var(--border))]">
            {loading && <div className="px-4 py-6 text-sm text-[hsl(var(--muted-foreground))]">Carregando diagnóstico...</div>}
            {!loading && report?.recommendations.length === 0 && (
              <div className="px-4 py-6 text-sm text-[hsl(var(--muted-foreground))]">Nenhum risco relevante agora.</div>
            )}
            {report?.recommendations.map((item) => (
              <div key={item.code} className="space-y-2 px-4 py-3">
                <Badge variant="outline" className={severityTone(item.severity)}>{item.severity === 'critical' ? 'crítico' : item.severity === 'warning' ? 'atenção' : 'info'}</Badge>
                <p className="text-sm font-medium leading-snug">{item.message}</p>
                <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{item.action}</p>
                <p className="truncate text-[11px] text-[hsl(var(--muted-foreground))]">{item.cameras.join(', ')}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ops-card overflow-hidden">
          <div className="ops-toolbar grid grid-cols-[minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(150px,0.8fr)_120px] gap-3 border-b border-[hsl(var(--border))] px-4 py-3 text-[10px] font-mono uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))] max-xl:hidden">
            <span>Câmera</span>
            <span>Live</span>
            <span>Gravação</span>
            <span>Operação</span>
            <span>Risco</span>
          </div>

          <div className="divide-y divide-[hsl(var(--border))]">
            {loading && <div className="px-4 py-8 text-sm text-[hsl(var(--muted-foreground))]">Carregando câmeras...</div>}
            {!loading && orderedCameras.length === 0 && (
              <div className="px-4 py-8 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma câmera encontrada.</div>
            )}
            {orderedCameras.map((camera) => (
              <div key={camera.cameraId} className="grid gap-3 px-4 py-4 transition-colors hover:bg-[hsl(var(--accent)_/_0.34)] xl:grid-cols-[minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(150px,0.8fr)_120px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {camera.status === 'ONLINE'
                      ? <CheckCircle2 className="h-4 w-4 text-[hsl(var(--chart-2))]" />
                      : <AlertTriangle className="h-4 w-4 text-[hsl(var(--chart-4))]" />}
                    <p className="truncate text-sm font-medium">{camera.cameraName}</p>
                  </div>
                  <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{camera.mediaMtx.pathName}</p>
                </div>

                <div className="text-xs">
                  <div className="flex items-center gap-2 text-sm">
                    <Video className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                    <span>{codecLabel(camera.profiles.live.codec)} para {codecLabel(camera.profiles.live.deliveryCodec)}</span>
                  </div>
                  <p className="mt-1 text-[hsl(var(--muted-foreground))]">{resolution(camera.profiles.live.width, camera.profiles.live.height)} · subtype {camera.profiles.live.subtype}</p>
                  {camera.profiles.live.transcodeForBrowser && <Badge variant="outline" className="mt-2 border-[hsl(var(--chart-4)_/_0.35)] text-[hsl(var(--chart-4))]">transcode</Badge>}
                </div>

                <div className="text-xs">
                  <div className="flex items-center gap-2 text-sm">
                    <HardDrive className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                    <span>{codecLabel(camera.profiles.recording.codec)}</span>
                  </div>
                  <p className="mt-1 text-[hsl(var(--muted-foreground))]">{resolution(camera.profiles.recording.width, camera.profiles.recording.height)} · {camera.profiles.recording.mode ?? 'modo padrão'}</p>
                  <Badge variant="outline" className={cn('mt-2', camera.profiles.recording.copyFriendly ? 'border-[hsl(var(--chart-2)_/_0.35)] text-[hsl(var(--chart-2))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]')}>
                    {camera.profiles.recording.copyFriendly ? 'copy' : 'compatível'}
                  </Badge>
                </div>

                <div className="text-xs">
                  <p className="text-sm">{camera.operations.live.failuresLast24h} falha(s) live</p>
                  <p className="mt-1 text-[hsl(var(--muted-foreground))]">{camera.operations.recording.segmentsLast24h} segmento(s) 24h · {camera.operations.recording.coveragePercentLast24h}% cobertura</p>
                  <p className="mt-1 text-[hsl(var(--muted-foreground))]">gap {durationLabel(camera.operations.recording.gapSecondsLast24h)} · maior {durationLabel(camera.operations.recording.largestGapSecondsLast24h)}</p>
                  <p className="mt-1 text-[hsl(var(--muted-foreground))]">analytics {camera.profiles.analytics.separatedFromLive ? 'separado' : 'acoplado'} · {camera.mediaMtx.readerCount} leitor(es)</p>
                  {camera.operations.live.lastFailure?.reason && (
                    <p className="mt-1 truncate text-[hsl(var(--chart-4))]">{camera.operations.live.lastFailure.reason}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className={cn('text-sm font-semibold', riskTone(camera.resource.level))}>{levelLabel(camera.resource.level)}</div>
                  <Progress value={Math.min(100, camera.resource.score)} className="h-1.5" />
                  <div className="flex flex-wrap gap-1">
                    {camera.resource.findings.slice(0, 2).map((finding) => (
                      <Badge key={finding.code} variant="outline" className={cn('max-w-full truncate', severityTone(finding.severity))}>{finding.message}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <AlertDialog open={confirmApplyOpen} onOpenChange={setConfirmApplyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar ajustes seguros de streaming?</AlertDialogTitle>
            <AlertDialogDescription>
              O DRAC não vai alterar IP, senha, RTSP, ONVIF, codec físico da câmera ou áudio — apenas parâmetros de entrega/streaming considerados seguros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void applySafeOptimizations()}>Aplicar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
