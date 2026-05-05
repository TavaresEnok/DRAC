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
};

const API_URL = getApiBaseUrl();

export function LiveStreamPlayer({
  cameraId,
  cameraName,
  className,
  autoPlay = true,
  muted = true,
  showOverlay = true,
}: LiveStreamPlayerProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<mpegts.Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(muted);

  const tokenHeaders = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined),
    [accessToken],
  );

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !accessToken) return;

    let cancelled = false;

    const boot = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data } = await axios.get<{
          protocols?: {
            flvUrl?: string | null;
            hlsUrl?: string | null;
            webrtcUrl?: string | null;
          };
          streamToken?: string;
        }>(
          `${API_URL}/camera-stream/${cameraId}/urls`,
          { headers: tokenHeaders },
        );

        if (cancelled) return;

        if (!mpegts.getFeatureList().mseLivePlayback) {
          throw new Error('Seu navegador não suporta live FLV/MSE.');
        }

        const url =
          data?.protocols?.flvUrl ||
          `${API_URL}/camera-stream/${cameraId}/flv?token=${encodeURIComponent(data.streamToken ?? '')}`;
        if (!url || url.endsWith('token=')) {
          throw new Error('URL de stream inválida retornada pela API.');
        }
        const player = mpegts.createPlayer(
          {
            type: 'flv',
            isLive: true,
            url,
            hasAudio: true,
          },
          {
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

        player.on(mpegts.Events.ERROR, (_type, _detail, info) => {
          if (cancelled) return;
          setError(typeof info === 'string' ? info : 'Falha ao carregar stream ao vivo.');
          setIsLoading(false);
        });

        element.onloadeddata = () => {
          if (cancelled) return;
          setIsLoading(false);
        };
      } catch (streamError) {
        if (cancelled) return;
        setError(streamError instanceof Error ? streamError.message : 'Falha ao iniciar stream.');
        setIsLoading(false);
      }
    };

    void boot();

    return () => {
      cancelled = true;
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
    };
  }, [accessToken, autoPlay, cameraId, tokenHeaders]);

  return (
    <div className={`relative overflow-hidden bg-black ${className ?? ''}`}>
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        muted={isMuted}
        playsInline
        autoPlay={autoPlay}
      />

      {showOverlay && isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white/80">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Carregando stream de {cameraName}
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
          </div>
        </div>
      )}

      {!isLoading && !error && (
        <button
          type="button"
          onClick={() => setIsMuted((value) => !value)}
          className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/70 transition-colors hover:bg-black/65 hover:text-white"
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
