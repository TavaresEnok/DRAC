import { useEffect, useMemo, useRef, useState } from 'react';
import mpegts from 'mpegts.js';
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
  startDelayMs?: number;
};

const API_URL = getApiBaseUrl();

export function LiveStreamPlayer({
  cameraId,
  cameraName,
  className,
  autoPlay = true,
  muted = true,
  showOverlay = true,
  startDelayMs = 0,
}: LiveStreamPlayerProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<mpegts.Player | null>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const webrtcPcRef = useRef<RTCPeerConnection | null>(null);
  const webrtcSessionUrlRef = useRef<string | null>(null);
  const webrtcStreamRef = useRef<MediaStream | null>(null);
  const hasFrameRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(muted);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [activeProtocol, setActiveProtocol] = useState<'WEBRTC' | 'FLV' | 'HLS' | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const tokenHeaders = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined),
    [accessToken],
  );

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

    const markHealthy = (protocol: 'WEBRTC' | 'FLV' | 'HLS') => {
      retryAttemptRef.current = 0;
      setRetryMessage(null);
      setError(null);
      setActiveProtocol(protocol);
      setIsLoading(false);
    };

    const scheduleReconnect = (message: string) => {
      if (cancelled) return;
      clearRetryTimer();
      const attempt = retryAttemptRef.current;
      const delayMs = Math.min(30000, 1500 * Math.max(1, 2 ** attempt));
      retryAttemptRef.current = attempt + 1;
      setError(null);
      setActiveProtocol(null);
      setRetryMessage(`${message} Reconectando automaticamente...`);
      setIsLoading(true);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        setReloadNonce((value) => value + 1);
      }, delayMs);
    };

    const boot = async () => {
      setIsLoading(true);
      setError(null);
      setActiveProtocol(null);
      hasFrameRef.current = false;

      try {
        const { data } = await axios.get<{
          preferredLiveProtocol?: 'flv' | 'hls' | 'webrtc' | 'mjpeg' | null;
          detectedVideoCodec?: string | null;
          protocols?: {
            flvUrl?: string | null;
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

        const flvUrl =
          data?.protocols?.flvUrl ||
          `${API_URL}/camera-stream/${cameraId}/flv`;
        const streamToken = data?.streamToken ?? '';
        const hlsUrl = data?.protocols?.hlsUrl ?? null;
        const whepUrl =
          data?.protocols?.whepUrl
          ?? (data?.protocols?.webrtcUrl ? `${data.protocols.webrtcUrl.replace(/\/+$/, '')}/whep` : null);
        const preferredLiveProtocol = data?.preferredLiveProtocol ?? 'flv';

        if (!flvUrl || !streamToken) {
          if (preferredLiveProtocol === 'webrtc' && whepUrl) {
            // Permite seguir com WebRTC mesmo sem token FLV.
          } else {
            throw new Error('URL de stream inválida retornada pela API.');
          }
        }

        const cleanupFlvPlayer = () => {
          if (!playerRef.current) return;
          try {
            playerRef.current.pause();
            playerRef.current.unload();
            playerRef.current.detachMediaElement();
            playerRef.current.destroy();
          } catch {
          }
          playerRef.current = null;
        };

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
          if (webrtcSessionUrlRef.current) {
            try {
              await fetch(webrtcSessionUrlRef.current, { method: 'DELETE', mode: 'cors' });
            } catch {
            }
            webrtcSessionUrlRef.current = null;
          }
        };

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
          cleanupFlvPlayer();
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
            markHealthy('WEBRTC');
          };

          pc.onconnectionstatechange = () => {
            if (cancelled) return;
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
              void cleanupWebrtc().finally(() => {
                scheduleReconnect('Stream indisponível via WebRTC.');
              });
            }
          };

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
        };

        const startHlsFallback = async () => {
          cleanupFlvPlayer();
          if (!hlsUrl) {
            throw new Error('Stream indisponível: FLV incompatível e HLS não disponível.');
          }

          const HlsModule = await import('hls.js');
          const Hls = HlsModule.default;

          if (Hls.isSupported()) {
            const hls = new Hls({
              lowLatencyMode: true,
              backBufferLength: 30,
            });
            hlsRef.current = hls;
            hls.attachMedia(element);
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
              hls.loadSource(hlsUrl);
            });
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (autoPlay) void element.play().catch(() => {});
              markHealthy('HLS');
            });
            hls.on(Hls.Events.ERROR, (_event, dataError) => {
              if (cancelled) return;
              if (dataError?.fatal) {
                cleanupHls();
                scheduleReconnect('Stream indisponível via HLS.');
              }
            });
            return;
          }

          if (element.canPlayType('application/vnd.apple.mpegurl')) {
            element.src = hlsUrl;
            if (autoPlay) void element.play().catch(() => {});
            element.onloadeddata = () => {
              if (cancelled) return;
              markHealthy('HLS');
            };
            return;
          }

          throw new Error('Navegador sem suporte para FLV e HLS.');
        };

        if (preferredLiveProtocol === 'webrtc' && whepUrl) {
          try {
            await startWebrtc(whepUrl);
            return;
          } catch {
            await cleanupWebrtc();
          }
        }

        if (preferredLiveProtocol === 'hls' && hlsUrl) {
          try {
            await startHlsFallback();
            return;
          } catch {
            cleanupHls();
          }
        }

        if (!mpegts.getFeatureList().mseLivePlayback) {
          await startHlsFallback();
          return;
        }

        const player = mpegts.createPlayer(
          {
            type: 'flv',
            isLive: true,
            url: flvUrl,
            hasAudio: true,
          },
          {
            headers: {
              Authorization: `Bearer ${streamToken}`,
            },
            enableWorker: false,
            liveBufferLatencyChasing: true,
            liveBufferLatencyMaxLatency: 1.5,
            liveBufferLatencyMinRemain: 0.2,
            autoCleanupSourceBuffer: true,
            fixAudioTimestampGap: false,
          },
        );

        playerRef.current = player;
        player.attachMediaElement(element);
        player.load();
        if (autoPlay) {
          void player.play();
        }
        noFrameTimeout = window.setTimeout(async () => {
          if (cancelled) return;
          if (hasFrameRef.current) return;
          try {
            cleanupFlvPlayer();
            await startHlsFallback();
          } catch {
            scheduleReconnect('Stream sem frames no FLV e fallback HLS indisponível.');
          }
        }, 8000);

        player.on(mpegts.Events.ERROR, async (_type, _detail, info) => {
          if (cancelled) return;
          try {
            if (noFrameTimeout != null) window.clearTimeout(noFrameTimeout);
            cleanupFlvPlayer();
            await startHlsFallback();
          } catch {
            const raw = typeof info === 'string' ? info : 'Falha ao carregar stream ao vivo.';
            const normalized = raw.includes('Invalid video packet type 4')
              ? 'Codec incompatível com FLV neste navegador. Habilite HLS/WebRTC para essa câmera.'
              : raw;
            scheduleReconnect(normalized);
          }
        });

        element.onloadeddata = () => {
          if (cancelled) return;
          hasFrameRef.current = true;
          if (noFrameTimeout != null) window.clearTimeout(noFrameTimeout);
          markHealthy('FLV');
        };
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
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.unload();
          playerRef.current.detachMediaElement();
          playerRef.current.destroy();
        } catch {
        }
        playerRef.current = null;
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
      element.srcObject = null;
      element.removeAttribute('src');
      element.load();
    };
  }, [accessToken, autoPlay, cameraId, startDelayMs, tokenHeaders, reloadNonce]);

  return (
    <div className={`relative overflow-hidden bg-black ${className ?? ''}`}>
      <video
        ref={videoRef}
        className="h-full w-full object-cover pointer-events-none"
        muted={isMuted}
        playsInline
        autoPlay={autoPlay}
      />

      {showOverlay && isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white/80">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            {retryMessage ?? `Carregando stream de ${cameraName}`}
          </div>
        </div>
      )}

      {showOverlay && error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
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

      {activeProtocol && (
        <div className="absolute right-2 top-2 z-30">
          <span
            className={`inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-semibold tracking-wide ${
              activeProtocol === 'WEBRTC'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : activeProtocol === 'HLS'
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-sky-500/40 bg-sky-500/15 text-sky-300'
            }`}
          >
            {activeProtocol === 'WEBRTC' ? 'WEBRTC ATIVO' : activeProtocol === 'HLS' ? 'HLS (FALLBACK)' : 'FLV ATIVO'}
          </span>
        </div>
      )}

      {!isLoading && !error && (
        <button
          type="button"
          onClick={() => setIsMuted((value) => !value)}
          className="absolute bottom-12 right-2 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/70 transition-colors hover:bg-black/65 hover:text-white"
          title={isMuted ? 'Ativar áudio' : 'Mutar áudio'}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      )}

      {!cameraId && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <VideoOff className="h-4 w-4" />
            Nenhuma câmera selecionada
          </div>
        </div>
      )}
    </div>
  );
}
