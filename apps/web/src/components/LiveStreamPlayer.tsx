import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import axios from 'axios';
import { AlertTriangle, LoaderCircle, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { getApiBaseUrl } from '../lib/api-base';
import { useAuthStore } from '../store/authStore';

type LiveStreamPlayerProps = {
  cameraId: string;
  cameraName: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  showOverlay?: boolean;
  liveViewMode?: 'selected' | 'grid';
  startDelayMs?: number;
  onStatusChange?: (status: LivePlayerStatus) => void;
};

const API_URL = getApiBaseUrl();
const HLS_FIRST_FRAME_TIMEOUT_MS = 8000;
const WEBRTC_FIRST_FRAME_TIMEOUT_MS = 7000;
const LIVE_RESUME_GRACE_MS = 1200;
const LIVE_SOFT_ONLY_RESUME_MS = 120000;
const LIVE_STALL_CHECK_INTERVAL_MS = 4000;
const LIVE_STALL_SOFT_RECOVER_MS = 8000;
const LIVE_STALL_RECONNECT_MS = 16000;
const LIVE_RECONNECT_DEBOUNCE_MS = 1200;
const LIVE_EDGE_OFFSET_SECONDS = 0.35;
const LIVE_RENDER_STALL_RECONNECT_MS = 10000;
const LIVE_VISUAL_FREEZE_RECONNECT_MS = 45000;
const LIVE_BLACK_FRAME_FAILOVER_MS = 6000;
const AI_OVERLAY_MAX_AGE_MS = 700;
const AI_OVERLAY_POLL_MS = 500;
const LIVE_VIEW_LEASE_TTL_SECONDS = 20;
const LIVE_VIEW_HEARTBEAT_MS = 7000;
const LIVE_PROTOCOL_STORAGE_PREFIX = 'drac-live-protocol';
// Stream token expires in 5 min on the server; renew 60s before to avoid black screen.
const STREAM_TOKEN_TTL_MS = 5 * 60 * 1000;
const STREAM_TOKEN_RENEW_BEFORE_MS = 60 * 1000;
type ActiveLiveProtocol = 'WEBRTC' | 'LL-HLS' | 'HLS';
type LiveProtocol = 'auto' | 'flv' | 'hls' | 'webrtc' | 'mjpeg' | 'llhls';
export type LivePlayerStatus = {
  activeProtocol: ActiveLiveProtocol | null;
  state: 'loading' | 'playing' | 'fallback' | 'error';
  reason: string | null;
};
type HlsController = {
  destroy: () => void;
  startLoad?: (startPosition?: number) => void;
  recoverMediaError?: () => void;
  liveSyncPosition?: number | null;
};

type PlaybackProgress = {
  wallTime: number;
  mediaTime: number;
};

type LiveDetection = {
  id: string;
  type: string;
  label: string;
  confidence: number | null;
  similarity: number | null;
  bbox: [number, number, number, number];
  frameWidth: number | null;
  frameHeight: number | null;
  occurredAt: string;
  overlayMode?: string | null;
  trackId?: number | null;
};

function normalizeCodec(codec?: string | null) {
  return String(codec ?? '').trim().toLowerCase();
}

function prefersModernBridge(codec?: string | null) {
  const normalized = normalizeCodec(codec);
  return normalized.includes('h265') || normalized.includes('hevc') || normalized.includes('hvc1') || normalized.includes('265');
}

function getStoredProtocol(cameraId: string): LiveProtocol | null {
  try {
    const stored = window.localStorage.getItem(`${LIVE_PROTOCOL_STORAGE_PREFIX}:${cameraId}`);
    const normalized = stored === 'll-hls' ? 'llhls' : stored;
    return normalized === 'webrtc' || normalized === 'hls' || normalized === 'llhls' ? normalized : null;
  } catch {
    return null;
  }
}

function storeProtocol(cameraId: string, protocol: ActiveLiveProtocol) {
  try {
    const normalized = protocol === 'LL-HLS' ? 'llhls' : protocol.toLowerCase();
    window.localStorage.setItem(`${LIVE_PROTOCOL_STORAGE_PREFIX}:${cameraId}`, normalized);
  } catch {
  }
}

function getRenderedVideoRect(
  video: HTMLVideoElement | null,
  containerWidth: number,
  containerHeight: number,
) {
  if (!video || containerWidth <= 0 || containerHeight <= 0) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight };
  }

  const videoWidth = video.videoWidth || 0;
  const videoHeight = video.videoHeight || 0;
  if (videoWidth <= 0 || videoHeight <= 0) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight };
  }

  const objectFit = window.getComputedStyle(video).objectFit || 'contain';
  if (objectFit === 'fill') {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight };
  }

  const scale = objectFit === 'cover'
    ? Math.max(containerWidth / videoWidth, containerHeight / videoHeight)
    : Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

function normalizeActiveProtocol(protocol: ActiveLiveProtocol): LiveProtocol {
  if (protocol === 'WEBRTC') return 'webrtc';
  if (protocol === 'LL-HLS') return 'llhls';
  return 'hls';
}

function buildProtocolOrder(
  cameraId: string,
  preferred: LiveProtocol | null | undefined,
  codec?: string | null,
  smartOrder?: LiveProtocol[] | null,
) {
  const stored = getStoredProtocol(cameraId);
  const order: LiveProtocol[] = [];
  const push = (protocol?: LiveProtocol | null) => {
    if (!protocol || protocol === 'mjpeg' || protocol === 'auto' || protocol === 'flv') return;
    if (!order.includes(protocol)) order.push(protocol);
  };

  if (smartOrder && smartOrder.length) {
    for (const protocol of smartOrder) push(protocol);
    push(stored);
    if (!order.includes('hls')) push('hls');
    if (!order.includes('webrtc')) push('webrtc');
    return order;
  }
  const normalizedPreferred = preferred === 'flv' ? 'auto' : preferred;
  if (normalizedPreferred === 'webrtc') return ['webrtc', 'llhls', 'hls'];
  if (normalizedPreferred === 'hls') return ['hls', 'llhls', 'webrtc'];
  if (normalizedPreferred === 'llhls') return ['llhls', 'hls', 'webrtc'];

  if (stored === 'llhls' || stored === 'hls') {
    push(stored);
    push('llhls');
    push('hls');
    push('webrtc');
    return order;
  }
  if (prefersModernBridge(codec)) {
    return ['webrtc', 'llhls', 'hls'];
  }
  return ['webrtc', 'llhls', 'hls'];
}

function seekVideoToLiveEdge(element: HTMLVideoElement) {
  const ranges = element.seekable;
  if (!ranges.length) return false;

  const liveEdge = ranges.end(ranges.length - 1);
  if (!Number.isFinite(liveEdge) || liveEdge <= 0) return false;

  const target = Math.max(ranges.start(ranges.length - 1), liveEdge - LIVE_EDGE_OFFSET_SECONDS);
  const drift = liveEdge - element.currentTime;

  if (Number.isFinite(drift) && drift > LIVE_EDGE_OFFSET_SECONDS) {
    element.currentTime = target;
    return true;
  }

  return false;
}

function getPlaybackProgress(element: HTMLVideoElement): PlaybackProgress {
  return {
    wallTime: Date.now(),
    mediaTime: Number.isFinite(element.currentTime) ? element.currentTime : 0,
  };
}

function createLiveViewSessionId(cameraId: string) {
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `live-${cameraId}-${Date.now().toString(36)}-${randomPart}`;
}

export function LiveStreamPlayer({
  cameraId,
  cameraName,
  className,
  autoPlay = true,
  muted = true,
  showOverlay = true,
  liveViewMode = 'selected',
  startDelayMs = 0,
  onStatusChange,
}: LiveStreamPlayerProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsController | null>(null);
  const webrtcPcRef = useRef<RTCPeerConnection | null>(null);
  const webrtcSessionUrlRef = useRef<string | null>(null);
  const webrtcStreamRef = useRef<MediaStream | null>(null);
  const hasFrameRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const activeProtocolRef = useRef<ActiveLiveProtocol | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const liveReloadAtRef = useRef(0);
  const preserveFrameOnReloadRef = useRef(false);
  const lastProgressRef = useRef<PlaybackProgress>({ wallTime: Date.now(), mediaTime: 0 });
  const lastRenderedFrameRef = useRef<PlaybackProgress & { presentedFrames: number }>({
    wallTime: Date.now(),
    mediaTime: 0,
    presentedFrames: 0,
  });
  const lastVisualHashRef = useRef<string | null>(null);
  const lastVisualChangeAtRef = useRef(Date.now());
  const blackFrameSinceRef = useRef<number | null>(null);
  const failedProtocolsRef = useRef<Set<LiveProtocol>>(new Set());
  const visualCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveViewSessionIdRef = useRef<string>(createLiveViewSessionId(cameraId));
  // Timer to proactively renew the stream token before it expires (avoids black screen)
  const streamTokenRenewTimerRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(muted);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [activeProtocol, setActiveProtocol] = useState<ActiveLiveProtocol | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [hasLiveFrame, setHasLiveFrame] = useState(false);
  const [detections, setDetections] = useState<LiveDetection[]>([]);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [protocolReason, setProtocolReason] = useState<string | null>(null);
  const [displayFps, setDisplayFps] = useState<number | null>(null);

  const tokenHeaders = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined),
    [accessToken],
  );

  useEffect(() => {
    setIsMuted(muted);
  }, [muted]);

  useEffect(() => {
    failedProtocolsRef.current.clear();
    blackFrameSinceRef.current = null;
    setProtocolReason(null);
    liveViewSessionIdRef.current = createLiveViewSessionId(cameraId);
  }, [cameraId]);

  useEffect(() => {
    onStatusChange?.({
      activeProtocol,
      state: error ? 'error' : isLoading ? 'loading' : protocolReason ? 'fallback' : 'playing',
      reason: error ?? protocolReason ?? retryMessage,
    });
  }, [activeProtocol, error, isLoading, onStatusChange, protocolReason, retryMessage]);

  const requestFreshLiveBoot = useCallback((message = 'Atualizando transmissão ao vivo...', preserveExistingFrame = true) => {
    const now = Date.now();
    if (now - liveReloadAtRef.current < LIVE_RECONNECT_DEBOUNCE_MS) return;

    const alreadyHadFrame = hasFrameRef.current;
    liveReloadAtRef.current = now;
    setRetryMessage(message);
    setError(null);
    if (!alreadyHadFrame || !preserveExistingFrame) {
      setActiveProtocol(null);
      activeProtocolRef.current = null;
      setIsLoading(true);
      setHasLiveFrame(false);
      hasFrameRef.current = false;
    } else {
      preserveFrameOnReloadRef.current = true;
      setIsLoading(false);
    }
    setReloadNonce((value) => value + 1);
  }, []);

  const sampleVideoHash = useCallback((element: HTMLVideoElement) => {
    if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || element.videoWidth <= 0 || element.videoHeight <= 0) {
      return null;
    }
    try {
      const canvas = visualCanvasRef.current ?? document.createElement('canvas');
      visualCanvasRef.current = canvas;
      canvas.width = 16;
      canvas.height = 9;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = '';
      for (let i = 0; i < data.length; i += 16) {
        const value = ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
        hash += String.fromCharCode(Math.round(value / 16));
      }
      return hash;
    } catch {
      return null;
    }
  }, []);

  const isLikelyBlackFrame = useCallback((element: HTMLVideoElement) => {
    if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || element.videoWidth <= 0 || element.videoHeight <= 0) {
      return false;
    }
    try {
      const canvas = visualCanvasRef.current ?? document.createElement('canvas');
      visualCanvasRef.current = canvas;
      canvas.width = 16;
      canvas.height = 9;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      let brightest = 0;
      const samples = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const value = ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
        sum += value;
        brightest = Math.max(brightest, value);
      }
      return sum / samples < 3 && brightest < 12;
    } catch {
      return false;
    }
  }, []);

  const failActiveProtocol = useCallback((reason: string) => {
    const active = activeProtocolRef.current;
    if (active) {
      failedProtocolsRef.current.add(normalizeActiveProtocol(active));
      const transitionReason = `${active} falhou: ${reason}. Alternando para o próximo protocolo.`;
      setProtocolReason(transitionReason);
      if (failedProtocolsRef.current.has('webrtc') && failedProtocolsRef.current.has('llhls') && failedProtocolsRef.current.has('hls')) {
        const attempt = retryAttemptRef.current;
        const delayMs = Math.min(30000, 1500 * Math.max(1, 2 ** attempt));
        retryAttemptRef.current = attempt + 1;
        setActiveProtocol(null);
        activeProtocolRef.current = null;
        setIsLoading(true);
        setHasLiveFrame(false);
        hasFrameRef.current = false;
        setRetryMessage(`Todos os protocolos falharam. Nova tentativa em ${Math.ceil(delayMs / 1000)}s.`);
        if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          failedProtocolsRef.current.clear();
          retryTimerRef.current = null;
          setReloadNonce((value) => value + 1);
        }, delayMs);
        return;
      }
      requestFreshLiveBoot(transitionReason, false);
      return;
    }
    requestFreshLiveBoot(reason, false);
  }, [requestFreshLiveBoot]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !accessToken) return;

    let cancelled = false;
    let noFrameTimeout: number | null = null;
    let bootDelayTimeout: number | null = null;

    const clearRetryTimer = () => {
      if (retryTimerRef.current == null) return;
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    };

    const markHealthy = (protocol: ActiveLiveProtocol) => {
      retryAttemptRef.current = 0;
      setRetryMessage(null);
      setError(null);
      setActiveProtocol(protocol);
      activeProtocolRef.current = protocol;
      lastProgressRef.current = getPlaybackProgress(element);
      lastRenderedFrameRef.current = {
        wallTime: Date.now(),
        mediaTime: Number.isFinite(element.currentTime) ? element.currentTime : 0,
        presentedFrames: lastRenderedFrameRef.current.presentedFrames,
      };
      hasFrameRef.current = true;
      setIsLoading(false);
      setHasLiveFrame(true);
      storeProtocol(cameraId, protocol);
    };

    const scheduleReconnect = (message: string) => {
      if (cancelled) return;
      clearRetryTimer();
      const attempt = retryAttemptRef.current;
      const delayMs = Math.min(30000, 1500 * Math.max(1, 2 ** attempt));
      retryAttemptRef.current = attempt + 1;
      const alreadyHadFrame = hasFrameRef.current;
      setError(null);
      setRetryMessage(`${message} Reconectando automaticamente...`);
      if (!alreadyHadFrame) {
        setActiveProtocol(null);
        activeProtocolRef.current = null;
        setIsLoading(true);
        setHasLiveFrame(false);
      } else {
        preserveFrameOnReloadRef.current = true;
        setIsLoading(false);
      }
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        setReloadNonce((value) => value + 1);
      }, delayMs);
    };

    const boot = async () => {
      const alreadyHadFrame = hasFrameRef.current;
      setIsLoading(!alreadyHadFrame);
      setError(null);
      if (!alreadyHadFrame) {
        setActiveProtocol(null);
        activeProtocolRef.current = null;
        setHasLiveFrame(false);
        setPosterUrl(null);
        hasFrameRef.current = false;
      }

      try {
        const { data } = await axios.get<{
          preferredLiveProtocol?: 'auto' | 'flv' | 'hls' | 'llhls' | 'webrtc' | 'mjpeg' | null;
          detectedVideoCodec?: string | null;
          sourceVideoCodec?: string | null;
          smartLive?: {
            enabled?: boolean;
            recommendedProtocol?: LiveProtocol;
            protocolOrder?: LiveProtocol[];
          } | null;
          protocols?: {
            posterUrl?: string | null;
            hlsUrl?: string | null;
            webrtcUrl?: string | null;
            whepUrl?: string | null;
          };
          streamToken?: string;
        }>(
          `${API_URL}/camera-stream/${cameraId}/urls`,
          { headers: tokenHeaders },
        );

        if (cancelled) return;

        const streamToken = data?.streamToken ?? '';
        const rawPosterUrl = data?.protocols?.posterUrl ?? `${API_URL}/camera-stream/${cameraId}/poster`;
        const hlsUrl = data?.protocols?.hlsUrl ?? null;
        const whepUrl =
          data?.protocols?.whepUrl
          ?? (data?.protocols?.webrtcUrl ? `${data.protocols.webrtcUrl.replace(/\/+$/, '')}/whep` : null);
        const preferredLiveProtocol = data?.preferredLiveProtocol ?? 'auto';
        const sourceCodec = data?.sourceVideoCodec ?? data?.detectedVideoCodec;
        const orderedProtocols = buildProtocolOrder(
          cameraId,
          preferredLiveProtocol,
          sourceCodec,
          data?.smartLive?.protocolOrder ?? null,
        );
        let protocolOrder = orderedProtocols.filter((protocol) => !failedProtocolsRef.current.has(protocol));
        if (!protocolOrder.length) {
          failedProtocolsRef.current.clear();
          protocolOrder = orderedProtocols;
          setProtocolReason('Todos os protocolos falharam; reiniciando o ciclo automático após reconexão.');
        }

        if (rawPosterUrl && streamToken) {
          const separator = rawPosterUrl.includes('?') ? '&' : '?';
          setPosterUrl(`${rawPosterUrl}${separator}token=${encodeURIComponent(streamToken)}&v=${Date.now()}`);
        }

        if (!streamToken) {
          throw new Error('Token de stream inválido retornado pela API.');
        }

        // Schedule proactive token renewal before it expires (5min TTL, renew 60s early)
        if (streamTokenRenewTimerRef.current != null) {
          window.clearTimeout(streamTokenRenewTimerRef.current);
        }
        streamTokenRenewTimerRef.current = window.setTimeout(() => {
          if (!cancelled) {
            requestFreshLiveBoot('Renovando token de stream...', true);
          }
          streamTokenRenewTimerRef.current = null;
        }, STREAM_TOKEN_TTL_MS - STREAM_TOKEN_RENEW_BEFORE_MS);

        const cleanupHls = () => {
          if (!hlsRef.current) return;
          try {
            hlsRef.current.destroy();
          } catch {
          }
          hlsRef.current = null;
        };

        const cleanupWebrtc = async () => {
          if (webrtcPcRef.current) {
            try {
              webrtcPcRef.current.ontrack = null;
              webrtcPcRef.current.onconnectionstatechange = null;
              webrtcPcRef.current.close();
            } catch {
            }
            webrtcPcRef.current = null;
          }
          if (webrtcStreamRef.current) {
            try {
              for (const track of webrtcStreamRef.current.getTracks()) {
                track.stop();
              }
            } catch {
            }
            webrtcStreamRef.current = null;
          }
          // Clear srcObject so HLS can take control — per the HTML media spec,
          // srcObject takes strict priority over src.  If left non-null,
          // hls.js's MediaSource object URL assigned via element.src is silently
          // ignored and the video element never renders HLS content.
          try {
            element.srcObject = null;
            element.removeAttribute('src');
            element.load();
          } catch {
          }
          if (webrtcSessionUrlRef.current) {
            try {
              await fetch(webrtcSessionUrlRef.current, { method: 'DELETE', mode: 'cors' });
            } catch {
            }
            webrtcSessionUrlRef.current = null;
          }
        };

        const waitForVisibleFrame = (protocol: ActiveLiveProtocol, timeoutMs: number) => new Promise<void>((resolve, reject) => {
          let interval: number | null = null;
          let blackFrameObserved = false;
          let done = false;
          const finish = (error?: Error) => {
            if (done) return;
            done = true;
            if (interval != null) window.clearInterval(interval);
            window.clearTimeout(timeout);
            if (error) reject(error);
            else resolve();
          };
          const check = () => {
            if (cancelled) {
              finish(new Error('Inicialização cancelada.'));
              return;
            }
            if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || element.videoWidth <= 0 || element.videoHeight <= 0) {
              return;
            }
            if (isLikelyBlackFrame(element)) {
              blackFrameObserved = true;
              return;
            }
            finish();
          };
          const timeout = window.setTimeout(() => {
            finish(new Error(blackFrameObserved
              ? `${protocol} conectou, mas entregou apenas imagem preta.`
              : `${protocol} não entregou vídeo válido dentro do tempo limite.`));
          }, timeoutMs);
          interval = window.setInterval(check, 200);
          check();
        });

        const waitIceGatheringComplete = (pc: RTCPeerConnection, timeoutMs = 1800) => {
          return new Promise<void>((resolve) => {
            if (pc.iceGatheringState === 'complete') {
              resolve();
              return;
            }
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              window.clearTimeout(timeout);
              pc.removeEventListener('icegatheringstatechange', onStateChange);
              resolve();
            };
            const onStateChange = () => {
              if (pc.iceGatheringState === 'complete') {
                finish();
              }
            };
            const timeout = window.setTimeout(finish, timeoutMs);
            pc.addEventListener('icegatheringstatechange', onStateChange);
          });
        };

        const startWebrtc = async (whepUrl: string) => {
          cleanupHls();
          await cleanupWebrtc();

          if (typeof RTCPeerConnection === 'undefined') {
            throw new Error('Navegador sem suporte WebRTC.');
          }

          element.removeAttribute('src');
          element.srcObject = null;
          element.load();

          const pc = new RTCPeerConnection();
          webrtcPcRef.current = pc;

          pc.addTransceiver('video', { direction: 'recvonly' });
          pc.addTransceiver('audio', { direction: 'recvonly' });

          await new Promise<void>((resolve, reject) => {
            let videoTrackReceived = false;
            const startupTimeout = window.setTimeout(() => {
              if (!videoTrackReceived) {
                reject(new Error('WebRTC não entregou uma track de vídeo dentro do tempo limite.'));
              }
            }, WEBRTC_FIRST_FRAME_TIMEOUT_MS);

            pc.ontrack = (event) => {
              if (cancelled) return;
              const stream = event.streams[0] ?? (() => {
                const fallback = webrtcStreamRef.current ?? new MediaStream();
                fallback.addTrack(event.track);
                return fallback;
              })();
              webrtcStreamRef.current = stream;
              if (element.srcObject !== stream) {
                element.srcObject = stream;
              }
              if (autoPlay) void element.play().catch(() => {});
              if (event.track.kind !== 'video') return;
              videoTrackReceived = true;
              void waitForVisibleFrame('WEBRTC', WEBRTC_FIRST_FRAME_TIMEOUT_MS)
                .then(() => {
                  window.clearTimeout(startupTimeout);
                  markHealthy('WEBRTC');
                  resolve();
                })
                .catch((frameError) => {
                  window.clearTimeout(startupTimeout);
                  reject(frameError);
                });
            };

            pc.onconnectionstatechange = () => {
              if (cancelled) return;
              if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                window.clearTimeout(startupTimeout);
                if (activeProtocolRef.current === 'WEBRTC' && hasFrameRef.current) {
                  failActiveProtocol('conexão encerrada ou desconectada');
                } else {
                  reject(new Error('Stream indisponível via WebRTC.'));
                }
              }
            };

            void (async () => {
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await waitIceGatheringComplete(pc);

                const localSdp = pc.localDescription?.sdp;
                if (!localSdp) {
                  throw new Error('Falha ao gerar SDP local do WebRTC.');
                }

                const response = await fetch(whepUrl, {
                  method: 'POST',
                  mode: 'cors',
                  headers: {
                    'Content-Type': 'application/sdp',
                  },
                  body: localSdp,
                });

                if (!response.ok) {
                  throw new Error(`Falha ao conectar WebRTC (${response.status}).`);
                }

                const location = response.headers.get('location');
                if (location) {
                  webrtcSessionUrlRef.current = new URL(location, whepUrl).toString();
                }

                const remoteSdp = await response.text();
                await pc.setRemoteDescription({
                  type: 'answer',
                  sdp: remoteSdp,
                });
              } catch (error) {
                window.clearTimeout(startupTimeout);
                reject(error);
              }
            })();
          });
        };

        const startHls = async (lowLatencyMode: boolean, protocolName: ActiveLiveProtocol) => {
          if (!hlsUrl) {
            throw new Error('Stream HLS indisponível.');
          }

          const HlsModule = await import('hls.js/dist/hls.mjs');
          const Hls = HlsModule.default;

          if (Hls.isSupported()) {
            const hls = new Hls({
              lowLatencyMode,
              liveSyncDurationCount: 1,
              liveMaxLatencyDurationCount: 3,
              maxLiveSyncPlaybackRate: 1.5,
              backBufferLength: 30,
            });
            hlsRef.current = hls;
            const hlsFailure = new Promise<void>((_resolve, reject) => {
              hls.attachMedia(element);
              hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                hls.loadSource(hlsUrl);
              });
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (autoPlay) void element.play().catch(() => {});
              });
              hls.on(Hls.Events.ERROR, (_event, dataError) => {
                if (cancelled) return;
                if (dataError?.fatal) {
                  if (activeProtocolRef.current === protocolName && hasFrameRef.current) {
                    failActiveProtocol('erro fatal do manifesto ou mídia HLS');
                  } else {
                    reject(new Error('Stream indisponível via HLS.'));
                  }
                }
              });
            });
            await Promise.race([waitForVisibleFrame(protocolName, HLS_FIRST_FRAME_TIMEOUT_MS), hlsFailure]);
            markHealthy(protocolName);
            return;
          }

          if (element.canPlayType('application/vnd.apple.mpegurl')) {
            element.src = hlsUrl;
            if (autoPlay) void element.play().catch(() => {});
            await waitForVisibleFrame(protocolName, HLS_FIRST_FRAME_TIMEOUT_MS);
            markHealthy(protocolName);
            return;
          }

          throw new Error('Navegador sem suporte para HLS.');
        };

        for (const protocol of protocolOrder) {
          try {
            if (protocol === 'webrtc' && whepUrl) {
              await startWebrtc(whepUrl);
              return;
            }
            if (protocol === 'llhls' && hlsUrl) {
              await startHls(true, 'LL-HLS');
              return;
            }
            if (protocol === 'hls' && hlsUrl) {
              await startHls(false, 'HLS');
              return;
            }
          } catch (protocolError) {
            const protocolName = protocol === 'webrtc' ? 'WebRTC' : protocol === 'llhls' ? 'LL-HLS' : 'HLS';
            const failureReason = protocolError instanceof Error ? protocolError.message : 'falha desconhecida';
            failedProtocolsRef.current.add(protocol);
            setProtocolReason(`${protocolName} falhou: ${failureReason}. Testando o próximo protocolo.`);
            console.warn(`[LiveStreamPlayer:${cameraId}] ${protocolName} falhou: ${failureReason}`);
            if (noFrameTimeout != null) window.clearTimeout(noFrameTimeout);
            noFrameTimeout = null;
            cleanupHls();
            await cleanupWebrtc();
            if (!hasFrameRef.current) {
              setActiveProtocol(null);
              activeProtocolRef.current = null;
            }
          }
        }

        throw new Error('Nenhum protocolo de live conseguiu iniciar para esta câmera.');
      } catch (streamError) {
        if (cancelled) return;
        const message = streamError instanceof Error ? streamError.message : 'Falha ao iniciar stream.';
        if (/401|403|unauthorized|forbidden|auth|credencial|senha/i.test(message)) {
          setError('Falha de autenticação da câmera: valide usuário/senha RTSP/ONVIF.');
          setRetryMessage(null);
          setIsLoading(false);
        } else {
          scheduleReconnect(message);
        }
      }
    };

    bootDelayTimeout = window.setTimeout(() => {
      void boot();
    }, Math.max(0, startDelayMs));

    return () => {
      cancelled = true;
      if (bootDelayTimeout != null) window.clearTimeout(bootDelayTimeout);
      clearRetryTimer();
      if (noFrameTimeout != null) window.clearTimeout(noFrameTimeout);
      if (streamTokenRenewTimerRef.current != null) {
        window.clearTimeout(streamTokenRenewTimerRef.current);
        streamTokenRenewTimerRef.current = null;
      }
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {
        }
        hlsRef.current = null;
      }
      if (webrtcPcRef.current) {
        try {
          webrtcPcRef.current.ontrack = null;
          webrtcPcRef.current.onconnectionstatechange = null;
          webrtcPcRef.current.close();
        } catch {
        }
        webrtcPcRef.current = null;
      }
      if (webrtcStreamRef.current) {
        try {
          for (const track of webrtcStreamRef.current.getTracks()) {
            track.stop();
          }
        } catch {
        }
        webrtcStreamRef.current = null;
      }
      if (webrtcSessionUrlRef.current) {
        void fetch(webrtcSessionUrlRef.current, { method: 'DELETE', mode: 'cors' }).catch(() => undefined);
        webrtcSessionUrlRef.current = null;
      }
      const preserveFrame = preserveFrameOnReloadRef.current && hasFrameRef.current;
      preserveFrameOnReloadRef.current = false;
      if (!preserveFrame) {
        element.srcObject = null;
        element.removeAttribute('src');
        element.load();
      }
    };
  }, [accessToken, autoPlay, cameraId, failActiveProtocol, isLikelyBlackFrame, requestFreshLiveBoot, startDelayMs, tokenHeaders, reloadNonce]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    const markProgress = () => {
      if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      lastProgressRef.current = getPlaybackProgress(element);
    };

    element.addEventListener('timeupdate', markProgress);
    element.addEventListener('playing', markProgress);
    element.addEventListener('loadeddata', markProgress);
    element.addEventListener('canplay', markProgress);
    return () => {
      element.removeEventListener('timeupdate', markProgress);
      element.removeEventListener('playing', markProgress);
      element.removeEventListener('loadeddata', markProgress);
      element.removeEventListener('canplay', markProgress);
    };
  }, []);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || typeof element.requestVideoFrameCallback !== 'function') return;

    let callbackId: number | null = null;
    let cancelled = false;
    let fpsWindowStartedAt = performance.now();
    let fpsWindowFrames = 0;
    const onFrame = (_now: number, metadata: { mediaTime?: number; presentedFrames?: number }) => {
      if (cancelled) return;
      lastRenderedFrameRef.current = {
        wallTime: Date.now(),
        mediaTime: Number.isFinite(metadata.mediaTime) ? metadata.mediaTime : element.currentTime,
        presentedFrames: metadata.presentedFrames ?? lastRenderedFrameRef.current.presentedFrames + 1,
      };
      fpsWindowFrames += 1;
      const elapsedMs = performance.now() - fpsWindowStartedAt;
      if (elapsedMs >= 1200) {
        setDisplayFps(Math.max(0, Math.round((fpsWindowFrames * 1000) / elapsedMs)));
        fpsWindowStartedAt = performance.now();
        fpsWindowFrames = 0;
      }
      callbackId = element.requestVideoFrameCallback(onFrame);
    };

    callbackId = element.requestVideoFrameCallback(onFrame);
    return () => {
      cancelled = true;
      setDisplayFps(null);
      if (callbackId != null && typeof element.cancelVideoFrameCallback === 'function') {
        element.cancelVideoFrameCallback(callbackId);
      }
    };
  }, []);

  useEffect(() => {
    const softResumeAtLiveEdge = () => {
      const element = videoRef.current;
      if (!element || !hasFrameRef.current) return;

      const protocol = activeProtocolRef.current;

      if (protocol === 'HLS') {
        try {
          hlsRef.current?.startLoad?.(-1);
          const liveSyncPosition = hlsRef.current?.liveSyncPosition;
          if (typeof liveSyncPosition === 'number' && Number.isFinite(liveSyncPosition)) {
            element.currentTime = Math.max(0, liveSyncPosition - LIVE_EDGE_OFFSET_SECONDS);
          } else {
            seekVideoToLiveEdge(element);
          }
        } catch {
          try {
            hlsRef.current?.recoverMediaError?.();
            hlsRef.current?.startLoad?.(-1);
          } catch {
          }
        }
      } else if (protocol === 'LL-HLS') {
        try {
          hlsRef.current?.startLoad?.(-1);
          seekVideoToLiveEdge(element);
        } catch {
        }
      }

      if (autoPlay) {
        void element.play().catch(() => {});
      }
    };

    const markHidden = () => {
      if (hiddenAtRef.current == null) {
        hiddenAtRef.current = Date.now();
      }
    };

    const resumeFromBrowserLifecycle = (forceReconnect = false) => {
      const hiddenForMs = hiddenAtRef.current == null ? 0 : Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = null;

      if (forceReconnect) {
        softResumeAtLiveEdge();
        window.setTimeout(() => {
          const element = videoRef.current;
          if (!element || document.hidden) return;
          if (element.paused || element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            requestFreshLiveBoot('Retomando câmera em tempo real...');
          }
        }, 900);
        return;
      }

      if (hiddenForMs > 0 && hiddenForMs < LIVE_RESUME_GRACE_MS) return;
      softResumeAtLiveEdge();

      if (hiddenForMs >= LIVE_SOFT_ONLY_RESUME_MS) {
        const before = lastProgressRef.current;
        window.setTimeout(() => {
          const element = videoRef.current;
          if (!element || document.hidden) return;
          const currentMediaTime = Number.isFinite(element.currentTime) ? element.currentTime : 0;
          const progressed = Math.abs(currentMediaTime - before.mediaTime) > 0.05;
          if (!progressed && element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
            requestFreshLiveBoot('Retomando câmera em tempo real...');
          }
        }, 1200);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        markHidden();
        return;
      }
      resumeFromBrowserLifecycle();
    };

    const onFocus = () => resumeFromBrowserLifecycle();
    const onPageShow = (event: PageTransitionEvent) => resumeFromBrowserLifecycle(event.persisted);
    const onPageHide = () => markHidden();
    const onFreeze = () => markHidden();
    const onResume = () => resumeFromBrowserLifecycle();

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('freeze', onFreeze);
    document.addEventListener('resume', onResume);
    window.addEventListener('blur', markHidden);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('freeze', onFreeze);
      document.removeEventListener('resume', onResume);
      window.removeEventListener('blur', markHidden);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [autoPlay, requestFreshLiveBoot]);

  useEffect(() => {
    const softRecoverStalledPlayer = () => {
      const element = videoRef.current;
      if (!element) return;

      const protocol = activeProtocolRef.current;
      if (protocol === 'HLS') {
        try {
          hlsRef.current?.startLoad?.(-1);
          seekVideoToLiveEdge(element);
        } catch {
          try {
            hlsRef.current?.recoverMediaError?.();
          } catch {
          }
        }
      } else if (protocol === 'LL-HLS') {
        try {
          hlsRef.current?.startLoad?.(-1);
          seekVideoToLiveEdge(element);
        } catch {
        }
      }

      if (autoPlay) {
        void element.play().catch(() => {});
      }
    };

    const interval = window.setInterval(() => {
      if (document.hidden || isLoading || error || !hasFrameRef.current) return;

      const element = videoRef.current;
      if (!element) return;

      if (autoPlay && element.paused) {
        void element.play().catch(() => {});
      }

      const now = Date.now();
      const renderedFrame = lastRenderedFrameRef.current;
      if (
        typeof element.requestVideoFrameCallback === 'function'
        && now - renderedFrame.wallTime >= LIVE_RENDER_STALL_RECONNECT_MS
      ) {
        failActiveProtocol('imagem congelada sem novos frames');
        return;
      }

      if (isLikelyBlackFrame(element)) {
        if (blackFrameSinceRef.current == null) blackFrameSinceRef.current = now;
        if (now - blackFrameSinceRef.current >= LIVE_BLACK_FRAME_FAILOVER_MS) {
          blackFrameSinceRef.current = null;
          failActiveProtocol('imagem preta persistente');
          return;
        }
      } else {
        blackFrameSinceRef.current = null;
      }

      const visualHash = sampleVideoHash(element);
      if (visualHash) {
        if (visualHash !== lastVisualHashRef.current) {
          lastVisualHashRef.current = visualHash;
          lastVisualChangeAtRef.current = now;
        } else if (now - lastVisualChangeAtRef.current >= LIVE_VISUAL_FREEZE_RECONNECT_MS) {
          lastVisualChangeAtRef.current = now;
          failActiveProtocol('imagem sem alteração por tempo demais');
          return;
        }
      }

      const currentMediaTime = Number.isFinite(element.currentTime) ? element.currentTime : 0;
      const lastProgress = lastProgressRef.current;
      if (Math.abs(currentMediaTime - lastProgress.mediaTime) > 0.05) {
        lastProgressRef.current = { wallTime: now, mediaTime: currentMediaTime };
        return;
      }

      const stalledForMs = now - lastProgress.wallTime;
      if (stalledForMs >= LIVE_STALL_RECONNECT_MS) {
        failActiveProtocol('transmissão sem progresso');
        return;
      }

      if (stalledForMs >= LIVE_STALL_SOFT_RECOVER_MS) {
        softRecoverStalledPlayer();
        return;
      }

      // Latency Drift Watchdog: force sync if we fall behind the live edge
      const protocol = activeProtocolRef.current;
      if (protocol === 'HLS' || protocol === 'LL-HLS') {
        const ranges = element.seekable;
        if (ranges.length > 0) {
          const liveEdge = ranges.end(ranges.length - 1);
          const drift = liveEdge - element.currentTime;
          if (Number.isFinite(drift) && drift > 3.5) {
            seekVideoToLiveEdge(element);
          }
        }
      }
    }, LIVE_STALL_CHECK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [autoPlay, error, failActiveProtocol, isLikelyBlackFrame, isLoading, sampleVideoHash]);

  useEffect(() => {
    if (!accessToken || !tokenHeaders) return;
    const sessionId = liveViewSessionIdRef.current;
    const payload = { sessionId, ttlSeconds: LIVE_VIEW_LEASE_TTL_SECONDS, viewMode: liveViewMode };

    const postLease = async (action: 'start' | 'heartbeat' | 'stop') => {
      try {
        await axios.post(
          `${API_URL}/ai/live-view/${action}/${cameraId}`,
          payload,
          { headers: tokenHeaders },
        );
      } catch {
      }
    };

    void postLease('start');
    const heartbeat = window.setInterval(() => {
      void postLease('heartbeat');
    }, LIVE_VIEW_HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeat);
      void postLease('stop');
    };
  }, [accessToken, cameraId, liveViewMode, tokenHeaders]);

  useEffect(() => {
    if (!showOverlay || !accessToken || error) {
      setDetections([]);
      return;
    }

    let cancelled = false;
    const loadDetections = async () => {
      try {
        const live = await axios.get<{ detections?: LiveDetection[] }>(
          `${API_URL}/ai/detections/latest/${cameraId}?maxAgeMs=${AI_OVERLAY_MAX_AGE_MS}&limit=10`,
          { headers: tokenHeaders },
        );
        if (!cancelled) {
          const snapshot = Array.isArray(live.data?.detections) ? live.data.detections : [];
          setDetections(snapshot);
        }
      } catch {
        if (!cancelled) setDetections([]);
      }
    };

    void loadDetections();
    const interval = window.setInterval(() => void loadDetections(), AI_OVERLAY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accessToken, cameraId, error, showOverlay, tokenHeaders]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden bg-black ${className ?? ''}`}>
      {posterUrl && !hasLiveFrame && (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-contain opacity-80"
          draggable={false}
        />
      )}

      <video
        ref={videoRef}
        className={`relative z-10 h-full w-full object-contain pointer-events-none transition-opacity duration-300 ${
          posterUrl && !hasLiveFrame ? 'opacity-0' : 'opacity-100'
        }`}
        muted={isMuted}
        playsInline
        autoPlay={autoPlay}
      />

      {showOverlay && detections.map((detection) => {
        const [x1, y1, x2, y2] = detection.bbox;
        const fallbackVideoWidth = videoRef.current?.videoWidth || 320;
        const fallbackVideoHeight = videoRef.current?.videoHeight || 180;
        const frameWidth = detection.frameWidth && detection.frameWidth > 0 ? detection.frameWidth : fallbackVideoWidth;
        const frameHeight = detection.frameHeight && detection.frameHeight > 0 ? detection.frameHeight : fallbackVideoHeight;
        const containerWidth = containerRef.current?.clientWidth ?? 0;
        const containerHeight = containerRef.current?.clientHeight ?? 0;
        let style: CSSProperties;
        if (containerWidth > 0 && containerHeight > 0) {
          const videoRect = getRenderedVideoRect(videoRef.current, containerWidth, containerHeight);
          const leftPx = videoRect.left + (x1 / frameWidth) * videoRect.width;
          const topPx = videoRect.top + (y1 / frameHeight) * videoRect.height;
          const rightPx = videoRect.left + (x2 / frameWidth) * videoRect.width;
          const bottomPx = videoRect.top + (y2 / frameHeight) * videoRect.height;
          const visibleLeft = Math.max(0, Math.min(containerWidth, leftPx));
          const visibleTop = Math.max(0, Math.min(containerHeight, topPx));
          const visibleRight = Math.max(visibleLeft + 1, Math.min(containerWidth, rightPx));
          const visibleBottom = Math.max(visibleTop + 1, Math.min(containerHeight, bottomPx));
          style = {
            left: `${visibleLeft}px`,
            top: `${visibleTop}px`,
            width: `${visibleRight - visibleLeft}px`,
            height: `${visibleBottom - visibleTop}px`,
          };
        } else {
          const left = Math.max(0, Math.min(100, (x1 / frameWidth) * 100));
          const top = Math.max(0, Math.min(100, (y1 / frameHeight) * 100));
          const width = Math.max(1, Math.min(100 - left, ((x2 - x1) / frameWidth) * 100));
          const height = Math.max(1, Math.min(100 - top, ((y2 - y1) / frameHeight) * 100));
          style = { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` };
        }
        const isFace = detection.type.startsWith('FACE');
        const isTriangle = !isFace && detection.overlayMode === 'triangle';
        const label = detection.similarity != null
          ? `${detection.label} ${(detection.similarity * 100).toFixed(0)}%`
          : detection.confidence != null
            ? `${detection.label} ${(detection.confidence * 100).toFixed(0)}%`
            : detection.label;
        if (isTriangle) {
          return (
            <div key={detection.id} className="pointer-events-none absolute z-30" style={style}>
              <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full">
                <span className="mx-auto block h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-amber-300/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]" />
              </div>
            </div>
          );
        }
        return (
          <div
            key={detection.id}
            className={`pointer-events-none absolute z-30 rounded-sm border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.45)] ${
              isFace ? 'border-emerald-400' : 'border-amber-400'
            }`}
            style={style}
          >
            <span
              className={`absolute -top-6 left-0 max-w-40 truncate rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black ${
                isFace ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}

      {showOverlay && isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white/80">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            {retryMessage ?? `Carregando stream de ${cameraName}`}
          </div>
        </div>
      )}

      {showOverlay && error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="max-w-[85%] rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-xs text-red-200">
            <div className="mb-2 flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Stream indisponível
            </div>
            <div>{error}</div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setIsLoading(true);
                setReloadNonce((value) => value + 1);
              }}
              className="mt-3 inline-flex h-8 items-center justify-center rounded border border-red-300/35 bg-black/30 px-3 text-[11px] text-red-100 hover:bg-black/45"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {(activeProtocol || displayFps != null) && (
        <div className="absolute bottom-11 right-2 z-30 flex items-center gap-1.5 opacity-70 transition-opacity hover:opacity-100">
          {displayFps != null && (
            <span className="inline-flex h-4 items-center rounded border border-white/10 bg-black/45 px-1.5 text-[8px] font-bold tracking-wider text-white/70">
              {displayFps} FPS
            </span>
          )}
          {activeProtocol && (
          <span
            className={`inline-flex h-4 items-center rounded border px-1.5 text-[8px] font-bold tracking-wider ${
              activeProtocol === 'WEBRTC'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : activeProtocol === 'HLS'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-sky-500/30 bg-sky-500/10 text-sky-400'
            }`}
          >
            {activeProtocol === 'WEBRTC'
              ? 'WEBRTC'
              : activeProtocol === 'LL-HLS'
                ? 'LL-HLS'
                : 'HLS'}
          </span>
          )}
        </div>
      )}

      {!isLoading && !error && (
        <button
          type="button"
          onClick={() => {
            const nextMuted = !isMuted;
            setIsMuted(nextMuted);
            const element = videoRef.current;
            if (element) {
              element.muted = nextMuted;
              element.volume = nextMuted ? element.volume : 1;
              if (!nextMuted) {
                void element.play().catch(() => {
                  // Alguns navegadores exigem novo gesto se a aba perdeu foco; o botão continua disponível.
                });
              }
            }
          }}
          className="absolute bottom-2 right-2 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
          title={isMuted ? 'Ativar áudio' : 'Mutar áudio'}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      )}

      {!cameraId && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <VideoOff className="h-4 w-4" />
            Nenhuma câmera selecionada
          </div>
        </div>
      )}
    </div>
  );
}
