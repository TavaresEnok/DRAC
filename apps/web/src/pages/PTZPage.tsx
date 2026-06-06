import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Crosshair,
  LoaderCircle,
  Radar,
  RotateCcw,
  Volume2,
  ZoomIn,
  ZoomOut,
  ExternalLink,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { toast } from '../hooks/use-toast';
import { LiveStreamPlayer } from '../components/LiveStreamPlayer';
import { getApiBaseUrl } from '../lib/api-base';
import { sendPtzCommand, type PTZDirection } from '../lib/ptz';
import { useAuthStore } from '../store/authStore';
import { useVmsDataStore } from '../store/vmsDataStore';

type CommandState = 'idle' | 'sending' | 'ok' | 'error';
const API_URL = getApiBaseUrl();
type PtzDiagnostics = {
  cameraId: string;
  ip: string;
  configured: {
    onvifPort: number | null;
    onvifPath: string | null;
    onvifProfileToken: string | null;
    channel: number | null;
  };
  detected: {
    ok: boolean;
    onvifPort: number | null;
    onvifPath: string | null;
    onvifProfileToken: string | null;
  };
  ptzLikelyWorking: boolean;
};

function ControlButton({
  label,
  icon,
  active,
  disabled,
  onStart,
  onStop,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={label}
      onMouseDown={(event) => {
        event.preventDefault();
        onStart();
      }}
      onMouseUp={onStop}
      onMouseLeave={onStop}
      onTouchStart={(event) => {
        event.preventDefault();
        onStart();
      }}
      onTouchEnd={onStop}
      onTouchCancel={onStop}
      className={[
        'flex h-12 w-12 items-center justify-center rounded-xl border transition-all select-none',
        active
          ? 'border-[hsl(var(--primary)_/_0.55)] bg-[hsl(var(--primary)_/_0.14)] text-[hsl(var(--primary))] shadow-[0_0_0_1px_hsl(var(--primary)_/_0.18)]'
          : 'border-border bg-card/70 text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)_/_0.35)] hover:bg-[hsl(var(--primary)_/_0.06)] hover:text-foreground',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      ].join(' ')}
    >
      {icon}
    </button>
  );
}

export default function PTZPage() {
  const [location, setLocation] = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const ptzCameras = useVmsDataStore((state) => state.cameras.filter((camera) => camera.ptzCapable));
  const [selectedCamId, setSelectedCamId] = useState('');
  const [speed, setSpeed] = useState(5);
  const [activeDirection, setActiveDirection] = useState<PTZDirection | null>(null);
  const [commandState, setCommandState] = useState<CommandState>('idle');
  const [lastCommand, setLastCommand] = useState<string>('Nenhum comando enviado');
  const [lastError, setLastError] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PtzDiagnostics | null>(null);

  const requestedCameraId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('cameraId');
  }, [location]);

  useEffect(() => {
    if (!ptzCameras.length) {
      setSelectedCamId('');
      return;
    }

    if (requestedCameraId && ptzCameras.some((camera) => camera.id === requestedCameraId)) {
      setSelectedCamId((current) => (current === requestedCameraId ? current : requestedCameraId));
      return;
    }

    if (!selectedCamId || !ptzCameras.some((camera) => camera.id === selectedCamId)) {
      setSelectedCamId(ptzCameras[0].id);
    }
  }, [ptzCameras, requestedCameraId, selectedCamId]);

  const selectedCam = ptzCameras.find((camera) => camera.id === selectedCamId) ?? null;
  const controlsDisabled = !selectedCam || !selectedCam.isOnline || commandState === 'sending';
  const ptzRejectedByDevice = Boolean(lastError && lastError.includes('Nenhum endpoint PTZ aceitou o comando'));

  const startMove = useCallback(
    async (direction: PTZDirection) => {
      if (!selectedCam || controlsDisabled) return;
      setActiveDirection(direction);
      setCommandState('sending');
      setLastError(null);
      setLastCommand(`Enviando ${direction} para ${selectedCam.name}`);

      try {
        await sendPtzCommand(selectedCam.id, { action: 'start', direction, speed });
        setCommandState('ok');
        setLastCommand(`Movimento ${direction} ativo em ${selectedCam.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao iniciar comando PTZ.';
        setActiveDirection(null);
        setCommandState('error');
        setLastError(message);
        setLastCommand(`Falha em ${direction} para ${selectedCam.name}`);
        toast({
          title: 'Falha no PTZ',
          description: message,
          variant: 'destructive',
        });
      }
    },
    [controlsDisabled, selectedCam, speed],
  );

  const stopMove = useCallback(async () => {
    if (!selectedCam || !activeDirection) return;

    const currentDirection = activeDirection;
    setActiveDirection(null);
    setCommandState('sending');

    try {
      await sendPtzCommand(selectedCam.id, { action: 'stop', direction: currentDirection });
      setCommandState('ok');
      setLastError(null);
      setLastCommand(`Movimento ${currentDirection} finalizado em ${selectedCam.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao parar movimento PTZ.';
      setCommandState('error');
      setLastError(message);
      setLastCommand(`Falha ao parar ${currentDirection} em ${selectedCam.name}`);
      toast({
        title: 'Falha ao parar PTZ',
        description: message,
        variant: 'destructive',
      });
    }
  }, [activeDirection, selectedCam]);

  const sendSingleStep = useCallback(
    async (direction: PTZDirection) => {
      if (!selectedCam || controlsDisabled) return;
      setCommandState('sending');
      setLastError(null);
      try {
        await sendPtzCommand(selectedCam.id, { action: 'step', direction, speed, durationMs: Math.max(180, speed * 70) });
        setCommandState('ok');
        setLastCommand(`Step ${direction} executado em ${selectedCam.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha no step PTZ.';
        setCommandState('error');
        setLastError(message);
        setLastCommand(`Falha no step ${direction} em ${selectedCam.name}`);
      }
    },
    [controlsDisabled, selectedCam, speed],
  );

  const runDiagnostics = useCallback(async () => {
    if (!selectedCam || !accessToken) return;
    setDiagnosing(true);
    try {
      const response = await fetch(`${API_URL}/ptz/${selectedCam.id}/diagnostics`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as PtzDiagnostics;
      setDiagnostics(data);
      toast({
        title: data.ptzLikelyWorking ? 'Controle PTZ pronto' : 'Controle PTZ indisponivel',
        description: data.ptzLikelyWorking
          ? 'A camera aceitou o controle externo.'
          : 'Nao foi possivel confirmar o controle externo desta camera.',
        variant: data.ptzLikelyWorking ? undefined : 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Falha no diagnóstico PTZ',
        description: error instanceof Error ? error.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setDiagnosing(false);
    }
  }, [accessToken, selectedCam]);

  if (!ptzCameras.length) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-lg border border-border bg-card/80 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-[hsl(var(--muted))]">
            <Crosshair className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
          </div>
          <h2 className="text-lg font-semibold">Nenhuma câmera PTZ disponível</h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Nenhuma camera com controle externo foi encontrada.
          </p>
        </div>
      </div>
    );
  }

  return (
      <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/70 px-4 py-3 shadow-sm">
        <div className="min-w-[260px] flex-1">
          <div className="text-sm font-semibold">Controle PTZ</div>
          <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Controle direcional com preview ao vivo.</div>
        </div>

        <Select value={selectedCamId} onValueChange={setSelectedCamId}>
          <SelectTrigger className="h-10 w-[min(100%,340px)] text-xs">
            <SelectValue placeholder="Selecione uma câmera PTZ" />
          </SelectTrigger>
          <SelectContent>
            {ptzCameras.map((camera) => (
              <SelectItem key={camera.id} value={camera.id} className="text-xs font-mono">
                {camera.code} - {camera.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-full max-w-52 rounded-xl border border-border bg-background/65 px-3 py-2 sm:w-52">
          <div className="mb-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
            <span>Velocidade</span>
            <span>{speed}</span>
          </div>
          <Slider value={[speed]} onValueChange={([value]) => setSpeed(value)} min={1} max={10} step={1} />
        </div>

        <button
          type="button"
          onClick={() => selectedCam && setLocation(`/cameras/${selectedCam.id}?tab=ptz`)}
          disabled={!selectedCam}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-45"
        >
          Abrir painel da câmera
          <ExternalLink className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => void runDiagnostics()}
          disabled={!selectedCam || diagnosing}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs hover:bg-[hsl(var(--accent))] disabled:opacity-45"
        >
          {diagnosing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
          Verificar
        </button>
      </div>

      <div className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_420px]">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-[22px] border border-border bg-[linear-gradient(160deg,hsl(222_22%_9%),hsl(220_18%_7%))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            {selectedCam?.isOnline ? (
              <LiveStreamPlayer
                cameraId={selectedCam.id}
                cameraName={selectedCam.name}
                className="absolute inset-0 h-full w-full"
                muted
                showOverlay
                aiEnabled={selectedCam.aiEnabled}
                liveViewMode="selected"
              />
            ) : null}

            <div className="pointer-events-none absolute inset-0 camera-scanline opacity-60" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-24 w-24 opacity-35">
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[hsl(var(--primary))]" />
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[hsl(var(--primary))]" />
                <div className="absolute inset-5 rounded-xl border border-[hsl(var(--primary)_/_0.7)]" />
              </div>
            </div>

            {!selectedCam?.isOnline && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                <div className="rounded-lg border border-border bg-black/45 px-5 py-4 text-center">
                  <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                  <div className="text-sm font-medium">Stream indisponível</div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    A câmera selecionada está offline ou sem sinal.
                  </div>
                </div>
              </div>
            )}

            <div className="absolute left-3 top-3 flex items-center gap-2">
              <span className="rounded-md border border-white/10 bg-black/45 px-2 py-1 text-[10px] text-white/70">
                {selectedCam?.code ?? 'SEM CAMERA'}
              </span>
              <span className="rounded-md border border-white/10 bg-black/45 px-2 py-1 text-[10px] text-white/70">
                {selectedCam?.isOnline ? 'Ao vivo' : 'Offline'}
              </span>
              {activeDirection && (
                <span className="rounded-md border border-[hsl(var(--primary)_/_0.4)] bg-[hsl(var(--primary)_/_0.14)] px-2 py-1 font-mono text-[10px] text-[hsl(var(--primary-foreground))]">
                  {activeDirection}
                </span>
              )}
            </div>

            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
              <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-xs text-white/78 backdrop-blur-sm">
                <div className="font-semibold">{selectedCam?.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-white/55">
                  <span>{selectedCam?.ipAddress}</span>
                  <span>•</span>
                  <span>{selectedCam?.model}</span>
                  <span>•</span>
                  <span>{selectedCam?.hasAudio ? 'Áudio' : 'Sem áudio'}</span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-right font-mono text-[10px] text-white/72 backdrop-blur-sm">
                <div>{selectedCam?.zone}</div>
                <div className="mt-1 text-white/45">Speed {speed}/10</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
              <div className="mb-1 text-[11px] text-[hsl(var(--muted-foreground))]">Status</div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {commandState === 'sending' ? <LoaderCircle className="h-4 w-4 animate-spin text-[hsl(var(--primary))]" /> : <Radar className="h-4 w-4 text-[hsl(var(--primary))]" />}
                {commandState === 'error' ? 'Erro operacional' : commandState === 'sending' ? 'Enviando comando' : 'Pronto'}
              </div>
            <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              {commandState === 'idle' ? 'Aguardando comando.' : lastCommand}
            </div>
              {ptzRejectedByDevice && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  O equipamento respondeu ao endpoint, mas rejeitou o PTZ externo. O stream segue online; o bloqueio está no protocolo de controle desta câmera.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
              <div className="mb-1 text-[11px] text-[hsl(var(--muted-foreground))]">Recursos</div>
              <div className="space-y-1 text-xs text-[hsl(var(--muted-foreground))]">
                <div>Audio: {selectedCam?.hasAudio ? 'sim' : 'nao identificado'}</div>
                <div>Video: {selectedCam?.isOnline ? 'online' : 'offline'}</div>
                <div>Gravacao: {selectedCam?.recordingMode === 'continuous' ? 'continua' : selectedCam?.recordingMode}</div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
              <div className="mb-1 text-[11px] text-[hsl(var(--muted-foreground))]">Observação</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Movimentos direcionais e zoom estão disponíveis quando a câmera permite controle externo.
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="rounded-[22px] border border-border bg-card/75 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Direção</div>
              </div>
              <button
                type="button"
                onClick={() => void stopMove()}
                disabled={!activeDirection}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Stop
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedCam || controlsDisabled) return;
                  setCommandState('sending');
                  setLastError(null);
                  try {
                    await sendPtzCommand(selectedCam.id, { action: 'home' });
                    setCommandState('ok');
                    setLastCommand(`Home position executada em ${selectedCam.name}`);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Falha ao enviar home position.';
                    setCommandState('error');
                    setLastError(message);
                    setLastCommand(`Falha no home em ${selectedCam.name}`);
                  }
                }}
                disabled={controlsDisabled}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Camera className="h-3.5 w-3.5" />
                Home
              </button>
            </div>

            <div className="mx-auto grid w-fit grid-cols-3 gap-2">
              <div />
              <ControlButton
                label="Up"
                icon={<ArrowUp className="h-4 w-4" />}
                active={activeDirection === 'Up'}
                disabled={controlsDisabled}
                onStart={() => void startMove('Up')}
                onStop={() => void stopMove()}
              />
              <div />
              <ControlButton
                label="Left"
                icon={<ArrowLeft className="h-4 w-4" />}
                active={activeDirection === 'Left'}
                disabled={controlsDisabled}
                onStart={() => void startMove('Left')}
                onStop={() => void stopMove()}
              />
              <button
                type="button"
                onClick={() => void stopMove()}
                disabled={!activeDirection}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-45"
                title="Parar movimento"
              >
                <Crosshair className="h-4 w-4" />
              </button>
              <ControlButton
                label="Right"
                icon={<ArrowRight className="h-4 w-4" />}
                active={activeDirection === 'Right'}
                disabled={controlsDisabled}
                onStart={() => void startMove('Right')}
                onStop={() => void stopMove()}
              />
              <div />
              <ControlButton
                label="Down"
                icon={<ArrowDown className="h-4 w-4" />}
                active={activeDirection === 'Down'}
                disabled={controlsDisabled}
                onStart={() => void startMove('Down')}
                onStop={() => void stopMove()}
              />
              <div />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <ControlButton
                label="Zoom In"
                icon={<ZoomIn className="h-4 w-4" />}
                active={activeDirection === 'ZoomIn'}
                disabled={controlsDisabled}
                onStart={() => void startMove('ZoomIn')}
                onStop={() => void stopMove()}
              />
              <ControlButton
                label="Zoom Out"
                icon={<ZoomOut className="h-4 w-4" />}
                active={activeDirection === 'ZoomOut'}
                disabled={controlsDisabled}
                onStart={() => void startMove('ZoomOut')}
                onStop={() => void stopMove()}
              />
            </div>
          </div>

          <div className="rounded-[22px] border border-border bg-card/75 p-5 shadow-sm">
            <div className="text-sm font-semibold">Passo curto</div>
            <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Reposicionamento fino.</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {([
                ['Up', 'Subir'],
                ['Down', 'Descer'],
                ['Left', 'Esquerda'],
                ['Right', 'Direita'],
                ['ZoomIn', 'Zoom +'],
                ['ZoomOut', 'Zoom -'],
              ] as Array<[PTZDirection, string]>).map(([direction, label]) => (
                <button
                  key={direction}
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => void sendSingleStep(direction)}
                  className="rounded-xl border border-border bg-background/55 px-3 py-2 text-left text-xs transition-colors hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="font-medium">{label}</div>
                  <div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Pulso</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-border bg-card/75 p-5 shadow-sm">
            <div className="text-sm font-semibold">Status da câmera</div>
            <div className="mt-3 space-y-2 text-xs text-[hsl(var(--muted-foreground))]">
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/55 px-3 py-2">
                <span>Stream online</span>
                <span>{selectedCam?.isOnline ? 'sim' : 'não'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/55 px-3 py-2">
                <span>Áudio no live</span>
                <span className="inline-flex items-center gap-1"><Volume2 className="h-3 w-3" /> {selectedCam?.hasAudio ? 'sim' : 'não'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/55 px-3 py-2">
                <span>Suporte PTZ</span>
                <span>{selectedCam?.ptzCapable ? 'sim' : 'não'}</span>
              </div>
            </div>

            {lastError && (
              <div className="mt-4 rounded-xl border border-[hsl(var(--destructive)_/_0.28)] bg-[hsl(var(--destructive)_/_0.08)] px-3 py-2 text-xs text-[hsl(var(--destructive))]">
                {lastError}
              </div>
            )}
            {diagnostics && (
              <details className="mt-4 rounded-xl border border-border bg-background/55 px-3 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                <summary className="cursor-pointer font-semibold text-foreground">Detalhes de suporte</summary>
                <div className="mt-2">
                <div>Config: porta {diagnostics.configured.onvifPort ?? '-'} · path {diagnostics.configured.onvifPath ?? '-'} · token {diagnostics.configured.onvifProfileToken ?? '-'}</div>
                <div className="mt-1">Detectado: porta {diagnostics.detected.onvifPort ?? '-'} · path {diagnostics.detected.onvifPath ?? '-'} · token {diagnostics.detected.onvifProfileToken ?? '-'}</div>
                <div className="mt-1">Resultado: {diagnostics.ptzLikelyWorking ? 'provável funcional' : 'falha de comunicação PTZ'}</div>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
