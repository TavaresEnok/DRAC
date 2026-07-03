import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  type ImageStyle,
  StyleSheet,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { WebRtcVideo } from './WebRtcVideo';

export type LiveStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline';

// Janela de tolerância para o PRIMEIRO frame. O path da câmera no MediaMTX pode
// estar em cold start (runOnDemand reabrindo o FFmpeg após 5 min sem espectador):
// reconectar antes disso só reinicia o relógio do arranque. 20s cobre o cold start
// sem deixar uma câmera realmente offline "pendurada" para sempre.
const FIRST_FRAME_GRACE_MS = 20_000;
// Tempo SEM o relógio de live avançar (congelamento real) antes de reconectar.
const STALL_RECONNECT_MS = 9_000;
const WATCHDOG_INTERVAL_MS = 3_000;
const RECONNECT_BASE_MS = 1_500;
const RECONNECT_MAX_MS = 8_000;

type LiveVideoProps = {
  uri: string | null;
  whepUri?: string | null;
  posterUri?: string | null;
  videoStyle: StyleProp<ViewStyle>;
  emptyStyle: StyleProp<ViewStyle>;
  posterStyle: StyleProp<ImageStyle>;
  emptyTitleStyle: StyleProp<TextStyle>;
  emptyTextStyle: StyleProp<TextStyle>;
  onStatusChange?: (status: LiveStatus) => void;
  muted?: boolean;
  contentFit?: 'contain' | 'cover';
  /** Só no caminho WebRTC: informa se o stream tem faixa de áudio. */
  onAudioAvailable?: (available: boolean) => void;
};

/**
 * Player ao vivo: tenta WebRTC (WHEP, baixa latência) primeiro e, se não conectar,
 * cai automaticamente para HLS — mesma estratégia do web. A falha do WebRTC marca
 * `webrtcFailed` e re-renderiza no caminho HLS (reseta ao trocar de câmera).
 */
export function LiveVideo(props: LiveVideoProps) {
  const { whepUri } = props;
  const [webrtcFailed, setWebrtcFailed] = useState(false);

  useEffect(() => {
    setWebrtcFailed(false);
  }, [whepUri]);

  if (whepUri && !webrtcFailed) {
    return (
      <WebRtcVideo
        whepUrl={whepUri}
        posterUri={props.posterUri}
        videoStyle={props.videoStyle}
        posterStyle={props.posterStyle}
        emptyTextStyle={props.emptyTextStyle}
        onStatusChange={props.onStatusChange}
        muted={props.muted}
        contentFit={props.contentFit}
        onAudioAvailable={props.onAudioAvailable}
        onFailover={() => setWebrtcFailed(true)}
      />
    );
  }

  return <HlsLiveVideo {...props} />;
}

function HlsLiveVideo({
  uri,
  posterUri,
  videoStyle,
  emptyStyle,
  posterStyle,
  emptyTitleStyle,
  emptyTextStyle,
  onStatusChange,
  muted = false,
  contentFit = 'contain',
}: LiveVideoProps) {
  // Player criado uma única vez. A troca de câmera/reconexão usa player.replace(),
  // sem recriar a instância — recriar a cada render causaria piscar e vazamento.
  const player = useVideoPlayer(null, (instance) => {
    // loop=false: stream AO VIVO não deve reproduzir em laço (o código antigo usava
    // loop=true, o que reapresentava segmentos antigos e atrapalhava o "ao vivo").
    instance.loop = false;
    instance.muted = false;
    instance.timeUpdateEventInterval = 1;
  });

  const [status, setStatus] = useState<LiveStatus>('idle');
  const statusRef = useRef<LiveStatus>('idle');
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const applyStatus = useCallback((next: LiveStatus) => {
    if (statusRef.current === next) return;
    statusRef.current = next;
    setStatus(next);
    onStatusChangeRef.current?.(next);
  }, []);

  // Mudo/áudio sob demanda (botão "Áudio" do ao vivo).
  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      // ignore
    }
  }, [muted, player]);

  useEffect(() => {
    if (!uri) {
      applyStatus('offline');
      try {
        player.pause();
        player.replace(null);
      } catch {
        // ignore
      }
      return;
    }

    let cancelled = false;
    let attempt = 0;
    let startedAt = Date.now();
    let lastProgressAt = Date.now();
    let lastTime = 0;
    let lastLive = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const buildSource = (): VideoSource => {
      const sep = uri.includes('?') ? '&' : '?';
      // Cache-buster por tentativa: garante que o player puxe o manifesto fresco em
      // vez de reusar segmentos velhos de uma sessão que congelou.
      return { uri: `${uri}${sep}_r=${attempt}` } as VideoSource;
    };

    const load = () => {
      if (cancelled) return;
      startedAt = Date.now();
      lastProgressAt = Date.now();
      lastTime = 0;
      lastLive = 0;
      try {
        player.replace(buildSource());
        player.play();
      } catch {
        // ignore
      }
    };

    const reconnect = () => {
      if (cancelled || reconnectTimer) return;
      applyStatus('reconnecting');
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.max(1, 2 ** attempt));
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        load();
      }, delay);
    };

    const markProgress = (t: number, live: number) => {
      const advancedTime = Number.isFinite(t) && t > lastTime + 0.05;
      const advancedLive = Number.isFinite(live) && live > lastLive + 0.05;
      if (advancedTime) lastTime = t;
      if (advancedLive) lastLive = live;
      if (advancedTime || advancedLive) {
        lastProgressAt = Date.now();
        attempt = 0;
        applyStatus('live');
      }
    };

    applyStatus('connecting');
    load();

    const statusSub = player.addListener('statusChange', (payload: { status?: string }) => {
      if (cancelled) return;
      const s = payload?.status;
      if (s === 'readyToPlay') {
        // Reproduzindo: marca ao vivo já (badge imediato). O watchdog abaixo ainda
        // detecta e reconecta se a imagem congelar de fato depois disso.
        attempt = 0;
        lastProgressAt = Date.now();
        applyStatus('live');
        try {
          if (!player.playing) player.play();
        } catch {
          // ignore
        }
      } else if (s === 'error') {
        reconnect();
      } else if (s === 'loading' && statusRef.current !== 'live') {
        applyStatus(statusRef.current === 'reconnecting' ? 'reconnecting' : 'connecting');
      }
    });

    const timeSub = player.addListener(
      'timeUpdate',
      (payload: { currentTime?: number; currentLiveTimestamp?: number | null }) => {
        if (cancelled) return;
        const t = typeof payload?.currentTime === 'number' ? payload.currentTime : player.currentTime;
        const live = typeof payload?.currentLiveTimestamp === 'number' ? payload.currentLiveTimestamp : 0;
        markProgress(t, live);
      },
    );

    const watchdog = setInterval(() => {
      if (cancelled) return;
      const now = Date.now();
      if (player.status === 'error') {
        reconnect();
        return;
      }
      // Ainda sem nenhum frame: trata como cold start e só reconecta após a janela
      // de tolerância (deixa o FFmpeg do path esquentar antes de desistir).
      if (lastTime <= 0 && lastLive <= 0) {
        if (now - startedAt > FIRST_FRAME_GRACE_MS) reconnect();
        return;
      }
      // Já estava progredindo e congelou.
      if (now - lastProgressAt > STALL_RECONNECT_MS) reconnect();
    }, WATCHDOG_INTERVAL_MS);

    // Background/foreground: pausa quando sai do app (economiza CPU/banda) e, ao
    // voltar, retoma — reconectando se a sessão tiver expirado/congelado enquanto fora.
    const appSub = AppState.addEventListener('change', (next) => {
      if (cancelled) return;
      if (next === 'active') {
        if (player.status === 'readyToPlay') {
          try {
            player.play();
          } catch {
            // ignore
          }
        } else {
          reconnect();
        }
      } else {
        try {
          player.pause();
        } catch {
          // ignore
        }
      }
    });

    return () => {
      cancelled = true;
      statusSub.remove();
      timeSub.remove();
      appSub.remove();
      clearInterval(watchdog);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        player.pause();
      } catch {
        // ignore
      }
    };
  }, [uri, player, applyStatus]);

  const showPoster = status !== 'live' && Boolean(posterUri);
  const showSpinner = status === 'connecting' || status === 'reconnecting';

  return (
    <View style={[videoStyle, local.container]}>
      {uri ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit={contentFit} />
      ) : null}

      {showPoster ? (
        <Image source={{ uri: posterUri ?? undefined }} style={[StyleSheet.absoluteFill, posterStyle]} />
      ) : null}

      {showSpinner ? (
        <View style={[StyleSheet.absoluteFill, local.overlay]}>
          <ActivityIndicator color="#ffffff" />
          <Text style={[emptyTextStyle, local.overlayText]}>
            {status === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}
          </Text>
        </View>
      ) : null}

      {status === 'offline' ? (
        <View style={[StyleSheet.absoluteFill, emptyStyle, local.overlay]}>
          <Text style={emptyTitleStyle}>Transmissão indisponível</Text>
          <Text style={emptyTextStyle}>
            A câmera pode estar offline, sem permissão ou sem resposta do servidor.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function PlaybackVideo({ uri, style }: { uri: string; style: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = false;
    instance.play();
  });

  return <VideoView player={player} style={style} nativeControls contentFit="contain" />;
}

const local = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  overlayText: {
    marginTop: 4,
  },
});
