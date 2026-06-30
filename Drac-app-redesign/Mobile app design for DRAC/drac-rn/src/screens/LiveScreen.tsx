/**
 * LiveScreen — visualização ao vivo de 1 câmera + controles PTZ.
 * Tela sempre escura (vídeo). Esconde a BottomTabs (controlado pelo App).
 *
 * Produção: trocar o LinearGradient pelo <RTCView> (react-native-webrtc / WHEP)
 * e disparar PTZ via POST /ptz/:cameraId/move em onPtz.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '../components/Icon';
import type { Camera } from '../types';

type Direction = 'up' | 'down' | 'left' | 'right';

interface LiveScreenProps {
  camera: Camera;
  onBack: () => void;
  onPtz?: (direction: Direction) => void;
}

const VIDEO_TEXT = '#fff';
const SURFACE = 'rgba(255,255,255,0.08)';
const SURFACE_BORDER = 'rgba(255,255,255,0.14)';

export function LiveScreen({ camera, onBack, onPtz }: LiveScreenProps) {
  const ControlButton = ({ icon, label, danger }: { icon?: IconName; label: string; danger?: boolean }) => (
    <View style={styles.ctrl}>
      <View style={[styles.ctrlCircle, danger && styles.ctrlDanger]}>
        {danger ? <View style={styles.recDot} /> : icon ? <Icon name={icon} size={22} color={VIDEO_TEXT} /> : null}
      </View>
      <Text style={styles.ctrlLabel}>{label}</Text>
    </View>
  );

  const PtzArrow = ({ icon, dir, style }: { icon: IconName; dir: Direction; style: object }) => (
    <Pressable style={[styles.ptzArrow, style]} onPress={() => onPtz?.(dir)}>
      <Icon name={icon} size={20} color="rgba(255,255,255,0.8)" strokeWidth={2.2} />
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#27313f', '#121922', '#0a0f15']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={styles.topShade} pointerEvents="none" />

      {/* Topo: voltar + nome + AO VIVO */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <Pressable style={styles.backBtn} onPress={onBack} hitSlop={8}>
            <Icon name="chevronLeft" size={20} color="#fff" strokeWidth={2.1} />
          </Pressable>
          <View>
            <Text style={styles.camName}>{camera.name}</Text>
            <Text style={styles.camMeta}>{camera.area} · WebRTC · {camera.resolution}</Text>
          </View>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>AO VIVO</Text>
        </View>
      </View>

      {/* Área de vídeo + overlays de IA */}
      <View style={styles.stage}>
        <View style={[styles.detection, { borderColor: '#34d399', left: 44, top: 90, width: 118, height: 148 }]}>
          <Text style={[styles.detTag, { backgroundColor: '#34d399', color: '#06281d' }]}>Pessoa · 98%</Text>
        </View>
        <View style={[styles.detection, { borderColor: '#3b82f6', right: 30, bottom: 40, width: 88, height: 64 }]}>
          <Text style={[styles.detTag, { backgroundColor: '#3b82f6', color: '#fff' }]}>Veículo · 91%</Text>
        </View>
        <Text style={styles.timestamp}>14:32:08</Text>
      </View>

      {/* Painel de controles (glass) */}
      <View style={styles.panel}>
        <View style={styles.ctrlRow}>
          <ControlButton label="Gravar" danger />
          <ControlButton icon="camera" label="Foto" />
          <ControlButton icon="mic" label="Áudio" />
          <ControlButton icon="expand" label="Tela" />
        </View>

        <View style={styles.ptzRow}>
          <View style={styles.ptzPad}>
            <PtzArrow icon="arrowUp" dir="up" style={{ top: 9, alignSelf: 'center' }} />
            <PtzArrow icon="arrowDown" dir="down" style={{ bottom: 9, alignSelf: 'center' }} />
            <PtzArrow icon="arrowLeft" dir="left" style={{ left: 9, top: '50%', marginTop: -16 }} />
            <PtzArrow icon="arrowRight" dir="right" style={{ right: 9, top: '50%', marginTop: -16 }} />
            <LinearGradient colors={['#3b82f6', '#2563eb']} style={styles.ptzCenter}>
              <Icon name="crosshair" size={18} color="#fff" strokeWidth={2} />
            </LinearGradient>
          </View>

          <View style={styles.ptzSide}>
            <View style={styles.zoomBar}>
              <Text style={styles.zoomLabel}>Zoom</Text>
              <View style={styles.zoomCtrls}>
                <View style={styles.zoomBtn}><Icon name="minus" size={16} color="#fff" /></View>
                <Text style={styles.zoomValue}>2.0×</Text>
                <View style={styles.zoomBtn}><Icon name="plus" size={16} color="#fff" /></View>
              </View>
            </View>
            <View style={styles.presetBar}>
              <Icon name="crosshair" size={17} color="#60a5fa" />
              <Text style={styles.presetText}>Presets PTZ</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070809' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: SURFACE, borderWidth: 1, borderColor: SURFACE_BORDER, alignItems: 'center', justifyContent: 'center' },
  camName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  camMeta: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5, fontWeight: '600' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.92)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 9 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  stage: { flex: 1, position: 'relative' },
  detection: { position: 'absolute', borderWidth: 2, borderRadius: 8 },
  detTag: { position: 'absolute', top: -22, left: -2, fontSize: 10, fontWeight: '800', paddingVertical: 2, paddingHorizontal: 7, borderRadius: 5, overflow: 'hidden' },
  timestamp: { position: 'absolute', right: 20, top: 8, color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.35)', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 8, overflow: 'hidden' },
  panel: { margin: 18, marginBottom: 30, padding: 16, paddingBottom: 18, borderRadius: 26, backgroundColor: 'rgba(20,24,31,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  ctrlRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  ctrl: { alignItems: 'center', gap: 6 },
  ctrlCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: SURFACE, borderWidth: 1, borderColor: SURFACE_BORDER, alignItems: 'center', justifyContent: 'center' },
  ctrlDanger: { backgroundColor: 'rgba(239,68,68,0.16)', borderColor: 'rgba(239,68,68,0.4)' },
  recDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444' },
  ctrlLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' },
  ptzRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ptzPad: { width: 124, height: 124, borderRadius: 62, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', position: 'relative' },
  ptzArrow: { position: 'absolute', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  ptzCenter: { position: 'absolute', top: 39, left: 39, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  ptzSide: { flex: 1, gap: 9 },
  zoomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14 },
  zoomLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  zoomCtrls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoomBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  zoomValue: { color: '#fff', fontSize: 13, fontWeight: '800', width: 34, textAlign: 'center' },
  presetBar: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14 },
  presetText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});
