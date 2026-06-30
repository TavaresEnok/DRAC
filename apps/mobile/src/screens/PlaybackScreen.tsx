/**
 * PlaybackScreen — seleção de câmera, navegação por dia, player (expo-video) e
 * lista de gravações reais com download. Visual do redesign sobre dados reais.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { PlaybackVideo } from '../components/VideoPlayers';
import { useTheme } from '../theme/ThemeProvider';
import type { ActivePlayback, Camera, Recording } from '../types';
import { areaLabel, isOnlineStatus, tintFor } from '../utils/camera-view';
import { formatBytes, formatDateLabel, formatDuration, formatTime } from '../utils/format';

interface PlaybackScreenProps {
  cameras: Camera[];
  selectedCamera: Camera | null;
  recordings: Recording[];
  activePlayback: ActivePlayback | null;
  recordingDate: string;
  onSelectCamera: (cameraId: string) => void;
  onOpenPlayback: (recording: Recording) => void;
  onClosePlayback: () => void;
  onDownloadRecording: (recording: Recording) => void;
  onPreviousDate: () => void;
  onNextDate: () => void;
}

export function PlaybackScreen({
  cameras, selectedCamera, recordings, activePlayback, recordingDate,
  onSelectCamera, onOpenPlayback, onClosePlayback, onDownloadRecording, onPreviousDate, onNextDate,
}: PlaybackScreenProps) {
  const { theme } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const isToday = recordingDate >= new Date().toISOString().slice(0, 10);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.text }]}>Reprodução</Text>

        {/* Seletor de câmera */}
        <Pressable
          style={[styles.selector, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => setPickerOpen(true)}
        >
          <View style={styles.selectorLeft}>
            <View style={[styles.dot, { backgroundColor: selectedCamera && isOnlineStatus(selectedCamera.status) ? theme.success : theme.textMuted }]} />
            <Text style={[styles.selectorText, { color: theme.text }]} numberOfLines={1}>
              {selectedCamera?.name ?? 'Selecione uma câmera'}
            </Text>
          </View>
          <Icon name="chevronDown" size={18} color={theme.textSub} strokeWidth={2} />
        </Pressable>

        {/* Player */}
        <View style={[styles.player, { borderColor: theme.border }]}>
          {activePlayback ? (
            <>
              <PlaybackVideo uri={activePlayback.url} style={StyleSheet.absoluteFill} />
              <Pressable style={styles.closePlayback} onPress={onClosePlayback} hitSlop={8}>
                <Icon name="close" size={16} color="#fff" strokeWidth={2.2} />
              </Pressable>
            </>
          ) : (
            <>
              <LinearGradient colors={['#1f2937', '#0b1018']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
              <View style={styles.playerEmpty}>
                <Icon name="play" size={26} color="rgba(255,255,255,0.5)" fill />
                <Text style={styles.playerEmptyText}>Toque numa gravação para reproduzir</Text>
              </View>
            </>
          )}
        </View>

        {/* Navegação por dia */}
        <View style={styles.daysRow}>
          <Pressable style={[styles.dayNav, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onPreviousDate}>
            <Icon name="chevronLeft" size={16} color={theme.textSub} strokeWidth={2.2} />
          </Pressable>
          <View style={[styles.dayPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Icon name="clock" size={14} color={theme.textSub} strokeWidth={2} />
            <Text style={[styles.dayPillText, { color: theme.text }]}>{formatDateLabel(recordingDate)}</Text>
          </View>
          <Pressable
            style={[styles.dayNav, { backgroundColor: theme.surface, borderColor: theme.border }, isToday && { opacity: 0.4 }]}
            onPress={isToday ? undefined : onNextDate}
            disabled={isToday}
          >
            <Icon name="chevronRight" size={16} color={theme.textSub} strokeWidth={2.2} />
          </Pressable>
        </View>

        {/* Lista de gravações */}
        <Text style={[styles.listTitle, { color: theme.text }]}>
          Gravações · {recordings.length}
        </Text>

        {recordings.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.textSub }]}>
              {selectedCamera ? 'Nenhuma gravação neste dia.' : 'Selecione uma câmera para ver as gravações.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 9 }}>
            {recordings.map((rec) => {
              const active = activePlayback?.recording.id === rec.id;
              const usable = rec.fileUsable !== false && rec.fileExists !== false;
              return (
                <Pressable
                  key={rec.id}
                  onPress={() => usable && onOpenPlayback(rec)}
                  style={[styles.recRow, { backgroundColor: active ? theme.accentBg : theme.surface, borderColor: active ? theme.accent : theme.border }, !usable && { opacity: 0.5 }]}
                >
                  <LinearGradient colors={selectedCamera ? tintFor(selectedCamera) : ['#243044', '#101826']} style={styles.recThumb}>
                    <Icon name="play" size={16} color="#fff" fill />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recRange, { color: theme.text }]}>
                      {formatTime(rec.startedAt)} – {rec.endedAt ? formatTime(rec.endedAt) : 'agora'}
                    </Text>
                    <View style={styles.recMeta}>
                      <Text style={[styles.recDuration, { color: theme.textSub }]}>{formatDuration(rec.durationSeconds)}</Text>
                      <Text style={[styles.recDuration, { color: theme.textMuted }]}>{formatBytes(rec.sizeBytes)}</Text>
                      {!usable ? <Text style={[styles.recTag, { color: theme.warning, backgroundColor: 'rgba(245,158,11,0.14)' }]}>indisponível</Text> : null}
                    </View>
                  </View>
                  <Pressable onPress={() => onDownloadRecording(rec)} hitSlop={8} disabled={!usable}>
                    <Icon name="download" size={19} color={theme.accent} strokeWidth={2} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Picker de câmera */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerRoot}>
          <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Selecionar câmera</Text>
            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              {cameras.map((cam) => {
                const on = cam.id === selectedCamera?.id;
                return (
                  <Pressable
                    key={cam.id}
                    onPress={() => { onSelectCamera(cam.id); setPickerOpen(false); }}
                    style={[styles.pickRow, { backgroundColor: on ? theme.accentBg : theme.surface, borderColor: on ? theme.accent : theme.border }]}
                  >
                    <LinearGradient colors={tintFor(cam)} style={styles.pickThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickName, { color: theme.text }]} numberOfLines={1}>{cam.name}</Text>
                      <Text style={[styles.pickArea, { color: theme.textSub }]} numberOfLines={1}>{areaLabel(cam)}</Text>
                    </View>
                    {on ? <Icon name="check" size={18} color={theme.accent} strokeWidth={2.6} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 24, gap: 14 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.5, marginTop: 10 },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 12, paddingHorizontal: 15 },
  selectorLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  selectorText: { fontSize: 14, fontWeight: '700', flex: 1 },
  player: { height: 200, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, position: 'relative', backgroundColor: '#070809' },
  playerEmpty: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10 },
  playerEmptyText: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, fontWeight: '600' },
  closePlayback: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  daysRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  dayNav: { width: 46, height: 44, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  dayPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth },
  dayPillText: { fontSize: 14, fontWeight: '800' },
  listTitle: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center' },
  emptyText: { fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 11, paddingHorizontal: 13 },
  recThumb: { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  recRange: { fontSize: 13.5, fontWeight: '700' },
  recMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  recDuration: { fontSize: 11, fontWeight: '600' },
  recTag: { fontSize: 9.5, fontWeight: '800', paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6, overflow: 'hidden' },
  pickerRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 34 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 6, marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  pickThumb: { width: 42, height: 42, borderRadius: 11 },
  pickName: { fontSize: 13.5, fontWeight: '700' },
  pickArea: { fontSize: 11.5, fontWeight: '600', marginTop: 1 },
});
