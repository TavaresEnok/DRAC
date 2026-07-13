/**
 * CameraTile — preview de câmera reutilizável (Central e Mosaico).
 * Mostra o poster real da câmera quando disponível; senão, um gradiente
 * placeholder determinístico. A estrela fixa a câmera na Central.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { Camera } from '../types';
import { areaLabel, isNoSignalStatus, isOnlineStatus, tintFor } from '../utils/camera-view';
import { Icon } from './Icon';

interface CameraTileProps {
  camera: Camera;
  posterUrl?: string | null;
  height?: number;
  variant?: 'large' | 'tile';
  showPlay?: boolean;
  onPress?: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** Pede ao pai um token/poster novo depois que retries locais falham. */
  onPosterError?: (cameraId: string) => void;
}

const STAR_GOLD = '#fbbf24';

export function CameraTile({
  camera, posterUrl, height = 138, variant = 'tile', showPlay = false, onPress, favorite, onToggleFavorite, onPosterError,
}: CameraTileProps) {
  const { theme } = useTheme();
  const online = isOnlineStatus(camera.status);
  const nosignal = isNoSignalStatus(camera.status);
  const offline = !online && !nosignal;
  const large = variant === 'large';
  const tint = tintFor(camera);
  const [posterRevision, setPosterRevision] = useState(0);
  const [posterFailed, setPosterFailed] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setPosterRevision(0);
    setPosterFailed(false);
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [posterUrl]);

  const visiblePosterUrl = posterUrl
    ? `${posterUrl}${posterUrl.includes('?') ? '&' : '?'}retry=${posterRevision}`
    : null;

  const retryPoster = () => {
    if (posterRevision >= 2) {
      setPosterFailed(true);
      onPosterError?.(camera.id);
      return;
    }
    retryTimerRef.current = setTimeout(() => {
      setPosterRevision((current) => current + 1);
    }, 700 * (posterRevision + 1));
  };

  const Star = onToggleFavorite ? (
    <Pressable
      style={[styles.star, large && { width: 32, height: 32 }]}
      onPress={(event) => {
        event.stopPropagation();
        onToggleFavorite();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={favorite ? `Remover ${camera.name} das favoritas` : `Adicionar ${camera.name} às favoritas`}
      accessibilityState={{ selected: !!favorite }}
    >
      <Icon name="star" size={large ? 17 : 14} color={favorite ? STAR_GOLD : '#fff'} fill={!!favorite} strokeWidth={1.7} />
    </Pressable>
  ) : null;

  if (nosignal || offline) {
    return (
      <Pressable
        style={[styles.wrap, { height, backgroundColor: '#0d0f14', borderColor: theme.border }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${camera.name}, ${nosignal ? 'sem sinal' : 'offline'}`}
      >
        <View style={styles.offline}>
          <Icon name="videoOff" size={22} color="#4b5563" strokeWidth={1.8} />
          <Text style={styles.offlineName}>{camera.name}</Text>
          <Text style={styles.offlineSub}>{nosignal ? 'Sem sinal' : 'Offline'}</Text>
        </View>
        {Star}
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[styles.wrap, { height, borderColor: theme.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${camera.name}, ${online ? 'ao vivo' : 'offline'}`}
    >
      <LinearGradient colors={tint} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Marca d'água de câmera SEMPRE atrás: se o snapshot ainda não chegou (ou
          falhar ao carregar), o tile continua identificável em vez de ficar liso. */}
      <View style={styles.placeholder} pointerEvents="none">
        <Icon name="camera" size={large ? 34 : 26} color="rgba(255,255,255,0.28)" strokeWidth={1.6} />
      </View>
      {visiblePosterUrl && !posterFailed ? (
        <Image
          key={visiblePosterUrl}
          source={{ uri: visiblePosterUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={retryPoster}
        />
      ) : null}

      {online ? (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>AO VIVO</Text>
        </View>
      ) : offline ? (
        <View style={[styles.statusDot, { backgroundColor: theme.danger, top: 11, left: 11 }]} />
      ) : null}

      {Star}

      {large ? (
        <View style={styles.largeFooter}>
          <View style={{ flex: 1 }}>
            <Text style={styles.largeName} numberOfLines={1}>{camera.name}</Text>
            <Text style={styles.largeMeta} numberOfLines={1}>{areaLabel(camera)}</Text>
          </View>
          {showPlay ? (
            <View style={styles.playFab}>
              <Icon name="play" size={17} color="#fff" fill />
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.tileName} numberOfLines={1}>{camera.name}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, position: 'relative' },
  placeholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  liveBadge: {
    position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(239,68,68,0.92)', paddingVertical: 3, paddingHorizontal: 7, borderRadius: 7,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.5 },
  statusDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  star: {
    position: 'absolute', top: 6, right: 6, width: 27, height: 27, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  tileName: { position: 'absolute', left: 11, bottom: 10, right: 11, color: '#fff', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  largeFooter: { position: 'absolute', left: 13, right: 13, bottom: 13, flexDirection: 'row', alignItems: 'flex-end' },
  largeName: { color: '#fff', fontSize: 16, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  largeMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, fontWeight: '600', marginTop: 1, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  playFab: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  offline: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  offlineName: { color: '#5b6573', fontSize: 11, fontWeight: '700' },
  offlineSub: { color: '#4b5563', fontSize: 9.5, fontWeight: '600' },
});
