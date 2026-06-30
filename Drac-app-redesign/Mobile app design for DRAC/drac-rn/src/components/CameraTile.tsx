/**
 * CameraTile — preview de câmera reutilizável (Central e Mosaico).
 * O fundo é um gradiente placeholder; a IA de produção troca por
 * <RTCView>/poster real (ver apps/mobile/src/components/VideoPlayers.tsx).
 *
 * A estrela (favorite/onToggleFavorite) fixa a câmera na Central.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { Camera } from '../types';
import { Icon } from './Icon';

interface CameraTileProps {
  camera: Camera;
  height?: number;
  variant?: 'large' | 'tile';
  showPlay?: boolean;
  onPress?: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}

const STAR_GOLD = '#fbbf24';

export function CameraTile({
  camera, height = 138, variant = 'tile', showPlay = false, onPress, favorite, onToggleFavorite,
}: CameraTileProps) {
  const { theme } = useTheme();
  const online = camera.status === 'ONLINE';
  const offline = camera.status === 'OFFLINE';
  const nosignal = camera.status === 'NOSIGNAL';
  const large = variant === 'large';

  const Star = onToggleFavorite ? (
    <Pressable
      style={[styles.star, large && { width: 32, height: 32 }]}
      onPress={onToggleFavorite}
      hitSlop={6}
    >
      <Icon name="star" size={large ? 17 : 14} color={favorite ? STAR_GOLD : '#fff'} fill={!!favorite} strokeWidth={1.7} />
    </Pressable>
  ) : null;

  if (nosignal) {
    return (
      <View style={[styles.wrap, { height, backgroundColor: '#0d0f14', borderColor: theme.border }]}>
        <View style={styles.offline}>
          <Icon name="videoOff" size={22} color="#4b5563" strokeWidth={1.8} />
          <Text style={styles.offlineName}>{camera.name}</Text>
          <Text style={styles.offlineSub}>Sem sinal</Text>
        </View>
        {Star}
      </View>
    );
  }

  return (
    <Pressable style={[styles.wrap, { height, borderColor: theme.border }]} onPress={onPress}>
      <LinearGradient colors={camera.tint} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />

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
            <Text style={styles.largeName}>{camera.name}</Text>
            <Text style={styles.largeMeta}>{camera.area} · {camera.resolution}</Text>
          </View>
          {showPlay ? (
            <View style={styles.playFab}>
              <Icon name="play" size={17} color="#fff" fill />
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.tileName}>{camera.name}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, position: 'relative' },
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
  tileName: { position: 'absolute', left: 11, bottom: 10, color: '#fff', fontSize: 12, fontWeight: '700' },
  largeFooter: { position: 'absolute', left: 13, right: 13, bottom: 13, flexDirection: 'row', alignItems: 'flex-end' },
  largeName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  largeMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  playFab: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  offline: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  offlineName: { color: '#5b6573', fontSize: 11, fontWeight: '700' },
  offlineSub: { color: '#4b5563', fontSize: 9.5, fontWeight: '600' },
});
