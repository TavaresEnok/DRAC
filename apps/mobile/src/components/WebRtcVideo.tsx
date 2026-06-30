import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, type ImageStyle, StyleSheet, type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native';
import { RTCPeerConnection, RTCSessionDescription, RTCView } from 'react-native-webrtc';
import type { LiveStatus } from './VideoPlayers';

const CONNECT_TIMEOUT_MS = 12_000;
const ICE_GATHER_TIMEOUT_MS = 2_000;

// react-native-webrtc expõe addEventListener em runtime (EventTarget do event-target-shim),
// mas os tipos publicados não declaram. Tipamos só os eventos que usamos e fazemos cast.
type RtcAudioTrack = { kind: string; enabled: boolean };
type RtcMediaStream = { toURL: () => string; getAudioTracks?: () => RtcAudioTrack[] };
type RtcTrackEvent = { streams?: RtcMediaStream[] };
type PcEvents = {
  addEventListener(type: 'track', listener: (event: RtcTrackEvent) => void): void;
  addEventListener(type: 'connectionstatechange' | 'icegatheringstatechange', listener: () => void): void;
  removeEventListener(type: 'icegatheringstatechange', listener: () => void): void;
};

type WebRtcVideoProps = {
  whepUrl: string;
  posterUri?: string | null;
  videoStyle: StyleProp<ViewStyle>;
  posterStyle: StyleProp<ImageStyle>;
  emptyTextStyle: StyleProp<TextStyle>;
  onStatusChange?: (status: LiveStatus) => void;
  onFailover: () => void;
  muted?: boolean;
  contentFit?: 'contain' | 'cover';
};

function waitIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const ev = pc as unknown as PcEvents;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ev.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
    ev.addEventListener('icegatheringstatechange', onChange);
  });
}

/**
 * Player WebRTC ao vivo (recvonly) via WHEP, conectando direto no MediaMTX — mesma
 * estratégia do web. Se não conectar (timeout/erro), chama onFailover para o pai cair
 * para HLS. Renderiza o MediaStream com RTCView do react-native-webrtc.
 */
export function WebRtcVideo({
  whepUrl,
  posterUri,
  videoStyle,
  posterStyle,
  emptyTextStyle,
  onStatusChange,
  onFailover,
  muted = false,
  contentFit = 'contain',
}: WebRtcVideoProps) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const liveRef = useRef(false);
  const streamRef = useRef<RtcMediaStream | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // Aplica o estado de mudo à trilha de áudio recebida (botão "Áudio").
  const applyMuted = (stream: RtcMediaStream | null) => {
    try {
      stream?.getAudioTracks?.().forEach((track) => { track.enabled = !mutedRef.current; });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    applyMuted(streamRef.current);
  }, [muted]);
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;
  const onFailoverRef = useRef(onFailover);
  onFailoverRef.current = onFailover;

  const apply = (next: LiveStatus) => {
    setStatus(next);
    onStatusRef.current?.(next);
    liveRef.current = next === 'live';
  };

  useEffect(() => {
    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    let sessionUrl: string | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const failover = () => {
      if (cancelled) return;
      cancelled = true;
      onFailoverRef.current?.();
    };

    const start = async () => {
      apply('connecting');
      try {
        pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        const ev = pc as unknown as PcEvents;
        ev.addEventListener('track', (event) => {
          const stream = event.streams?.[0];
          if (stream && !cancelled) {
            streamRef.current = stream;
            applyMuted(stream);
            setStreamUrl(stream.toURL());
          }
        });
        ev.addEventListener('connectionstatechange', () => {
          if (cancelled || !pc) return;
          const state = pc.connectionState;
          if (state === 'connected') {
            if (timeout) clearTimeout(timeout);
            apply('live');
          } else if (state === 'failed') {
            failover();
          }
        });

        timeout = setTimeout(() => {
          if (!cancelled && !liveRef.current) failover();
        }, CONNECT_TIMEOUT_MS);

        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        await waitIceGathering(pc);
        if (cancelled) return;

        const response = await fetch(whepUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp ?? offer.sdp,
        });
        if (!response.ok) throw new Error(`WHEP ${response.status}`);
        sessionUrl = response.headers.get('location');
        if (sessionUrl) sessionUrl = new URL(sessionUrl, whepUrl).toString();
        const answer = await response.text();
        if (cancelled) return;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer }));
      } catch {
        failover();
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      if (sessionUrl) fetch(sessionUrl, { method: 'DELETE' }).catch(() => undefined);
      if (pc) {
        try {
          pc.close();
        } catch {
          // ignore
        }
      }
    };
  }, [whepUrl]);

  const showPoster = status !== 'live' && Boolean(posterUri);

  return (
    <View style={[videoStyle, local.container]}>
      {streamUrl ? (
        <RTCView streamURL={streamUrl} style={StyleSheet.absoluteFill} objectFit={contentFit} />
      ) : null}

      {showPoster ? <Image source={{ uri: posterUri ?? undefined }} style={[StyleSheet.absoluteFill, posterStyle]} /> : null}

      {status !== 'live' ? (
        <View style={[StyleSheet.absoluteFill, local.overlay]}>
          <ActivityIndicator color="#ffffff" />
          <Text style={[emptyTextStyle, local.overlayText]}>Conectando ao vivo…</Text>
        </View>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  container: { overflow: 'hidden', position: 'relative' },
  overlay: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
  overlayText: { marginTop: 4 },
});
