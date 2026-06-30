import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  LoaderCircle,
  Lock,
  PlayCircle,
  Power,
  XCircle,
  Zap,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { getApiBaseUrl } from '../lib/api-base';
import { useAuthStore } from '../store/authStore';
import { toast } from '../hooks/use-toast';

const API_URL = getApiBaseUrl();
const METRICS_POLL_MS = 2000;
const HISTORY = 60;

type GpuStatus = {
  vendor: 'nvidia' | 'intel' | 'none';
  enabled: boolean;
  ready: boolean;
  device: { name: string | null; driver: string | null; memoryTotalMb: number | null } | null;
  checks: { gpuVisible: boolean; transcodeAccel: boolean; aiAccel: boolean };
  ai: {
    featureEnabled: boolean;
    accelerationEnabled: boolean;
    ready: boolean;
    reachable: boolean;
    runtime: string | null;
    device: string | null;
  };
  hints: string[];
};

type GpuMetrics = {
  available: boolean;
  utilizationPct: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  temperatureC: number | null;
  encoderSessions: number | null;
  powerWatts: number | null;
  sampledAt: string;
};

type VerifyResult = { ok: boolean; encoder: string | null; elapsedMs: number | null; message: string };

function CheckRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-online))]" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</div>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/55 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function GpuAccelerationPanel() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [metrics, setMetrics] = useState<GpuMetrics | null>(null);
  const [history, setHistory] = useState<{ t: number; util: number }[]>([]);
  const pollRef = useRef<number | null>(null);

  const loadStatus = useCallback(async () => {
    if (!headers) return;
    try {
      const { data } = await axios.get<GpuStatus>(`${API_URL}/gpu/status`, { headers });
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Poll de métricas só enquanto houver GPU visível (evita chamadas inúteis).
  useEffect(() => {
    if (!headers || !status?.checks.gpuVisible) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const tick = async () => {
      try {
        const { data } = await axios.get<GpuMetrics>(`${API_URL}/gpu/metrics`, { headers });
        setMetrics(data);
        if (data.available && data.utilizationPct != null) {
          setHistory((prev) => [...prev, { t: Date.now(), util: data.utilizationPct as number }].slice(-HISTORY));
        }
      } catch {
        /* ignora falhas pontuais de métrica */
      }
    };
    void tick();
    pollRef.current = window.setInterval(() => void tick(), METRICS_POLL_MS);
    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, status?.checks.gpuVisible]);

  const toggle = async () => {
    if (!headers || !status) return;
    const next = !status.enabled;
    setToggling(true);
    try {
      const { data } = await axios.post<GpuStatus>(`${API_URL}/gpu/mode`, { enabled: next }, { headers });
      setStatus(data);
      toast({ title: next ? 'Aceleração por GPU ativada' : 'Aceleração por GPU desativada', description: next ? 'O transcode passará a usar a placa de vídeo.' : 'O transcode voltou para a CPU.' });
    } catch (e) {
      const msg = axios.isAxiosError(e) ? (e.response?.data?.message ?? e.message) : 'Falha ao alterar modo de GPU.';
      toast({ title: 'Não foi possível ativar', description: String(msg), variant: 'destructive' });
    } finally {
      setToggling(false);
    }
  };

  const [togglingAi, setTogglingAi] = useState(false);
  const toggleAi = async () => {
    if (!headers || !status) return;
    const next = !status.ai.accelerationEnabled;
    setTogglingAi(true);
    try {
      const { data } = await axios.post<GpuStatus>(`${API_URL}/gpu/ai-mode`, { enabled: next }, { headers });
      setStatus(data);
      toast({ title: next ? 'Aceleração de IA ativada' : 'Aceleração de IA desativada' });
    } catch (e) {
      const msg = axios.isAxiosError(e) ? (e.response?.data?.message ?? e.message) : 'Falha ao alterar aceleração de IA.';
      toast({ title: 'Não foi possível alterar', description: String(msg), variant: 'destructive' });
    } finally {
      setTogglingAi(false);
    }
  };

  const runVerify = async () => {
    if (!headers) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { data } = await axios.post<VerifyResult>(`${API_URL}/gpu/verify`, {}, { headers });
      setVerifyResult(data);
      toast({ title: data.ok ? 'Auto-teste OK' : 'Auto-teste falhou', description: data.message, variant: data.ok ? undefined : 'destructive' });
    } catch (e) {
      const msg = axios.isAxiosError(e) ? (e.response?.data?.message ?? e.message) : 'Falha no auto-teste.';
      setVerifyResult({ ok: false, encoder: null, elapsedMs: null, message: String(msg) });
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border/70 bg-card/85 p-10 text-sm text-[hsl(var(--muted-foreground))]">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Detectando GPU...
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-lg border border-border/70 bg-card/85 p-6 text-sm text-[hsl(var(--muted-foreground))]">
        Não foi possível consultar o status da GPU.
      </div>
    );
  }

  const vendorLabel = status.vendor === 'nvidia' ? 'NVIDIA' : status.vendor === 'intel' ? 'Intel' : 'Nenhuma';
  const memPct = metrics?.memoryUsedMb != null && metrics?.memoryTotalMb
    ? Math.round((metrics.memoryUsedMb / metrics.memoryTotalMb) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho de status */}
      <div className="rounded-lg border border-border/70 bg-card/85 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${status.ready ? 'border-[hsl(var(--status-online)_/_0.4)] bg-[hsl(var(--status-online)_/_0.1)] text-[hsl(var(--status-online))]' : 'border-border bg-background/60 text-[hsl(var(--muted-foreground))]'}`}>
              <Cpu className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold">
                {status.device?.name ?? (status.vendor === 'none' ? 'GPU não detectada' : `GPU ${vendorLabel}`)}
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                {status.device
                  ? `${vendorLabel} · driver ${status.device.driver ?? '-'} · ${status.device.memoryTotalMb ?? '-'} MB`
                  : 'Nenhuma GPU visível dentro do container.'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${status.enabled ? 'border-[hsl(var(--status-online)_/_0.4)] bg-[hsl(var(--status-online)_/_0.1)] text-[hsl(var(--status-online))]' : 'border-border bg-background/60 text-[hsl(var(--muted-foreground))]'}`}>
              <Zap className="h-3.5 w-3.5" /> {status.enabled ? 'Acelerado (GPU)' : 'CPU (libx264)'}
            </span>
            <button
              onClick={() => void toggle()}
              disabled={toggling || (!status.enabled && !status.ready)}
              className={`btn btn-sm ${status.enabled ? 'border-[hsl(var(--destructive)_/_0.4)] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)_/_0.08)]' : 'btn-primary'} disabled:opacity-50`}
              title={!status.enabled && !status.ready ? 'A GPU precisa estar pronta (checklist) para ativar' : undefined}
            >
              {toggling ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              {status.enabled ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>
      </div>

      {/* Checklist de pré-requisitos */}
      <div className="rounded-lg border border-border/70 bg-card/85 p-5 shadow-sm">
        <div className="text-sm font-semibold">Pré-requisitos</div>
        <div className="mt-1 divide-y divide-border/60">
          <CheckRow ok={status.checks.gpuVisible} label="GPU visível no container" hint="GPU passada aos serviços (NVIDIA Container Toolkit + override de compose)." />
          <CheckRow ok={status.checks.transcodeAccel} label="Encoder acelerado no ffmpeg (transcode)" hint="Imagem com h264_nvenc (NVIDIA) ou VAAPI/QSV (Intel)." />
          <CheckRow ok={status.checks.aiAccel} label="IA com runtime acelerado" hint={status.ai.reachable ? `Runtime: ${status.ai.runtime ?? '-'} · device: ${status.ai.device ?? '-'}` : 'Serviço de IA não respondeu (opcional para o transcode).'} />
        </div>
        {status.hints.length > 0 && (
          <div className="mt-3 space-y-2">
            {status.hints.map((h, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-[hsl(var(--status-warning)_/_0.3)] bg-[hsl(var(--status-warning)_/_0.08)] px-3 py-2 text-xs text-[hsl(var(--status-warning))]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{h}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => void runVerify()} disabled={verifying} className="btn btn-secondary btn-sm disabled:opacity-50">
            {verifying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Rodar auto-teste
          </button>
          {verifyResult && (
            <span className={`inline-flex items-center gap-1.5 text-xs ${verifyResult.ok ? 'text-[hsl(var(--status-online))]' : 'text-[hsl(var(--destructive))]'}`}>
              {verifyResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {verifyResult.message}
            </span>
          )}
        </div>
      </div>

      {/* Gráfico ao vivo */}
      <div className="rounded-lg border border-border/70 bg-card/85 p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-[hsl(var(--primary))]" /> Uso da GPU ao vivo
          </div>
          {metrics?.available && (
            <span className="text-xs text-[hsl(var(--muted-foreground))] tabular-nums">{metrics.utilizationPct ?? 0}%</span>
          )}
        </div>

        {metrics?.available ? (
          <>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id="gpuUtil" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={32} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    labelFormatter={() => ''}
                    formatter={(v: number) => [`${v}%`, 'Uso']}
                  />
                  <Area type="monotone" dataKey="util" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gpuUtil)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="VRAM" value={memPct != null ? `${memPct}% · ${metrics.memoryUsedMb}/${metrics.memoryTotalMb} MB` : '-'} />
              <Stat label="Temperatura" value={metrics.temperatureC != null ? `${metrics.temperatureC} °C` : '-'} />
              <Stat label="Sessões NVENC" value={metrics.encoderSessions != null ? String(metrics.encoderSessions) : '-'} />
              <Stat label="Consumo" value={metrics.powerWatts != null ? `${metrics.powerWatts} W` : '-'} />
            </div>
          </>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/70 text-sm text-[hsl(var(--muted-foreground))]">
            Métricas indisponíveis (sem GPU NVIDIA visível neste serviço).
          </div>
        )}
      </div>

      {/* Aceleração de IA — pronta, porém dormente enquanto a IA estiver desativada */}
      <div className="rounded-lg border border-border/70 bg-card/85 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background/60 text-[hsl(var(--muted-foreground))]">
              <BrainCircuit className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold">Aceleração de IA</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                {status.ai.featureEnabled
                  ? (status.ai.reachable ? `Runtime: ${status.ai.runtime ?? '-'} · device: ${status.ai.device ?? '-'}` : 'Serviço de IA fora do ar.')
                  : 'Roda a detecção (objetos/rostos) na GPU em vez da CPU.'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${status.ai.accelerationEnabled ? 'border-[hsl(var(--status-online)_/_0.4)] bg-[hsl(var(--status-online)_/_0.1)] text-[hsl(var(--status-online))]' : 'border-border bg-background/60 text-[hsl(var(--muted-foreground))]'}`}>
              <Zap className="h-3.5 w-3.5" /> {status.ai.accelerationEnabled ? 'IA na GPU' : 'IA na CPU'}
            </span>
            <button
              onClick={() => void toggleAi()}
              disabled={togglingAi || !status.ai.featureEnabled || (!status.ai.accelerationEnabled && !status.ai.ready)}
              className={`btn btn-sm ${status.ai.accelerationEnabled ? 'border-[hsl(var(--destructive)_/_0.4)] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)_/_0.08)]' : 'btn-primary'} disabled:opacity-50`}
            >
              {togglingAi ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              {status.ai.accelerationEnabled ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>

        {!status.ai.featureEnabled && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/70 bg-background/55 px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              A IA está <strong>desativada</strong> no sistema. Toda a lógica e a infraestrutura de aceleração de IA por GPU já estão prontas e dormentes — este controle será liberado quando a IA for ativada.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
