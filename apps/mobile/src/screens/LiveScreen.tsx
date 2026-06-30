/**
 * LiveScreen — ao vivo + gravações de 1 câmera numa tela só (modelo NVR).
 *
 * RETRATO (padrão): vídeo full-width 16:9 no topo (contentFit=contain, NUNCA
 * corta — requisito CCTV) → linha de ações (Gravar/Foto/Áudio/PTZ/Tela) → área
 * inferior que alterna entre a LINHA DO TEMPO das gravações (padrão) e o PAD PTZ
 * (ao tocar em PTZ). Tocar numa gravação faz o MESMO player de cima reproduzi-la.
 * IMERSIVO (botão "Tela" ou aparelho deitado): vídeo em tela cheia + painel glass.
 * PTZ, gravação e playback são ações reais via callbacks do App.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetectionOverlay } from '../components/DetectionOverlay';
import { Icon, type IconName } from '../components/Icon';
import { LiveVideo, PlaybackVideo, type LiveStatus } from '../components/VideoPlayers';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import type { ActivePlayback, Camera, Direction, LiveDetection, Recording } from '../types';
import { areaLabel, resolutionLabel } from '../utils/camera-view';
import { formatBytes, formatDateLabel, formatDuration, formatTime } from '../utils/format';

interface LiveScreenProps {
  camera: Camera;
  topInset?: number;
  streamUrl: string | null;
  whepUrl: string | null;
  posterUrl: string | null;
  detections: LiveDetection[];
  ptzActive: Direction | null;
  ptzFeedback: string | null;
  recordings: Recording[];
  recordingDate: string;
  activePlayback: ActivePlayback | null;
  recordingActive: boolean;
  onBack: () => void;
  onSendPtz: (direction: Direction) => void;
  onToggleRecording: (camera: Camera) => void;
  onSnapshot: (camera: Camera) => void;
  onOpenPlayback: (recording: Recording) => void;
  onClosePlayback: () => void;
  onDownloadRecording: (recording: Recording) => void;
  onPreviousDate: () => void;
  onNextDate: () => void;
}

const VIDEO_TEXT = '#fff';
const GLASS_SURFACE = 'rgba(255,255,255,0.08)';
const GLASS_BORDER = 'rgba(255,255,255,0.14)';

const STATUS_LABEL: Record<LiveStatus, string> = {
  idle: 'SEM SINAL',
  connecting: 'CONECTANDO',
  live: 'AO VIVO',
  reconnecting: 'RECONECTANDO',
  offline: 'SEM SINAL',
};

type ControlTokens = {
  text: string; sub: string; surface: string; border: string;
  padBg: string; padBorder: string; barBg: string; barBorder: string;
};

function tokensFor(glass: boolean, theme: Theme): ControlTokens {
  if (glass) {
    return {
      text: VIDEO_TEXT, sub: 'rgba(255,255,255,0.7)', surface: GLASS_SURFACE, border: GLASS_BORDER,
      padBg: 'rgba(255,255,255,0.05)', padBorder: 'rgba(255,255,255,0.12)',
      barBg: 'rgba(255,255,255,0.06)', barBorder: 'rgba(255,255,255,0.1)',
    };
  }
  return {
    text: theme.text, sub: theme.textSub, surface: theme.surfaceAlt, border: theme.border,
    padBg: theme.surfaceAlt, padBorder: theme.border, barBg: theme.surfaceAlt, barBorder: theme.border,
  };
}

export function LiveScreen({
  camera, topInset = 0, streamUrl, whepUrl, posterUrl, detections, ptzActive, ptzFeedback,
  recordings, recordingDate, activePlayback, recordingActive,
  onBack, onSendPtz, onToggleRecording, onSnapshot,
  onOpenPlayback, onClosePlayback, onDownloadRecording, onPreviousDate, onNextDate,
}: LiveScreenProps) {
  const { theme } = useTheme();
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [muted, setMuted] = useState(true); // CCTV abre mudo por padrão
  const [fullscreen, setFullscreen] = useState(false);
  const [lowerMode, setLowerMode] = useState<'timeline' | 'ptz'>('timeline');

  const { width: winW, height: winH } = useWindowDimensions();
  const landscape = winW > winH;
  const insets = useSafeAreaInsets();
  const immersive = fullscreen || landscape;

  const [panelHidden, setPanelHidden] = useState(false);
  useEffect(() => { setPanelHidden(landscape); }, [landscape]);

  const aspect = camera.detectedWidth && camera.detectedHeight && camera.detectedWidth > 0 && camera.detectedHeight > 0
    ? camera.detectedWidth / camera.detectedHeight
    : 16 / 9;

  const playing = !!activePlayback;
  const isLive = liveStatus === 'live';
  const canControl = !!camera.canControl;
  const canRecord = !!camera.canRecord;
  const res = resolutionLabel(camera);
  const isToday = recordingDate >= new Date().toISOString().slice(0, 10);

  const onVideoLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setVideoSize((cur) => (cur.width === width && cur.height === height ? cur : { width, height }));
  };

  // Player real: ao vivo (WHEP→HLS) OU a gravação selecionada (mesmo palco).
  const videoEl = (
    <>
      {playing ? (
        <PlaybackVideo uri={activePlayback!.url} style={StyleSheet.absoluteFill} />
      ) : (
        <LiveVideo
          uri={streamUrl}
          whepUri={whepUrl}
          posterUri={posterUrl}
          videoStyle={styles.videoFill}
          muted={muted}
          contentFit="contain"
          emptyStyle={styles.videoEmpty}
          posterStyle={StyleSheet.absoluteFill}
          emptyTitleStyle={styles.videoEmptyTitle}
          emptyTextStyle={styles.videoEmptyText}
          onStatusChange={setLiveStatus}
        />
      )}
      {!playing && isLive ? (
        <DetectionOverlay
          detections={detections}
          containerWidth={videoSize.width}
          containerHeight={videoSize.height}
          fallbackWidth={camera.detectedWidth}
          fallbackHeight={camera.detectedHeight}
        />
      ) : null}
    </>
  );

  const badge = playing ? (
    <Pressable style={[styles.liveBadge, styles.recBadge]} onPress={onClosePlayback} hitSlop={6}>
      <Icon name="play" size={9} color="#fff" fill />
      <Text style={styles.liveText}>GRAVAÇÃO</Text>
    </Pressable>
  ) : (
    <View style={[styles.liveBadge, !isLive && styles.liveBadgeIdle]}>
      <View style={[styles.liveDot, !isLive && { backgroundColor: 'rgba(255,255,255,0.6)' }]} />
      <Text style={styles.liveText}>{STATUS_LABEL[liveStatus]}</Text>
    </View>
  );

  const PtzArrow = ({ icon, dir, style, c }: { icon: IconName; dir: Direction; style: object; c: ControlTokens }) => (
    <Pressable
      disabled={!canControl}
      style={[styles.ptzArrow, style, ptzActive === dir && styles.ptzArrowActive]}
      onPress={() => onSendPtz(dir)}
      hitSlop={6}
    >
      <Icon name={icon} size={20} color={canControl ? c.text : c.sub} strokeWidth={2.2} />
    </Pressable>
  );

  // Pad PTZ + zoom (usado no painel imersivo e na área inferior do retrato).
  const PtzControls = ({ c, centered }: { c: ControlTokens; centered?: boolean }) => (
    <View style={[styles.ptzRow, centered && styles.ptzRowCentered]}>
      <View style={[styles.ptzPad, { backgroundColor: c.padBg, borderColor: c.padBorder }, !canControl && { opacity: 0.5 }]}>
        <PtzArrow icon="arrowUp" dir="Up" c={c} style={{ top: 9, alignSelf: 'center' }} />
        <PtzArrow icon="arrowDown" dir="Down" c={c} style={{ bottom: 9, alignSelf: 'center' }} />
        <PtzArrow icon="arrowLeft" dir="Left" c={c} style={{ left: 9, top: '50%', marginTop: -16 }} />
        <PtzArrow icon="arrowRight" dir="Right" c={c} style={{ right: 9, top: '50%', marginTop: -16 }} />
        <LinearGradient colors={['#3b82f6', '#2563eb']} style={styles.ptzCenter}>
          <Icon name="crosshair" size={18} color="#fff" strokeWidth={2} />
        </LinearGradient>
      </View>
      <View style={styles.ptzSide}>
        <View style={[styles.zoomBar, { backgroundColor: c.barBg, borderColor: c.barBorder }, !canControl && { opacity: 0.5 }]}>
          <Text style={[styles.zoomLabel, { color: c.text }]}>Zoom</Text>
          <View style={styles.zoomCtrls}>
            <Pressable disabled={!canControl} style={[styles.zoomBtn, { backgroundColor: c.surface }, ptzActive === 'ZoomOut' && styles.zoomBtnActive]} onPress={() => onSendPtz('ZoomOut')} hitSlop={6}>
              <Icon name="minus" size={16} color={c.text} />
            </Pressable>
            <Pressable disabled={!canControl} style={[styles.zoomBtn, { backgroundColor: c.surface }, ptzActive === 'ZoomIn' && styles.zoomBtnActive]} onPress={() => onSendPtz('ZoomIn')} hitSlop={6}>
              <Icon name="plus" size={16} color={c.text} />
            </Pressable>
          </View>
        </View>
        <View style={[styles.hintBar, { backgroundColor: c.barBg, borderColor: c.barBorder }]}>
          <Icon name="crosshair" size={16} color="#60a5fa" />
          <Text style={[styles.hintText, { color: c.text }]}>{canControl ? 'Controle PTZ ativo' : 'Sem permissão PTZ'}</Text>
        </View>
      </View>
    </View>
  );

  // ───────────────────────── IMERSIVO (tela cheia) ─────────────────────
  if (immersive) {
    const c = tokensFor(true, theme);
    return (
      <View style={styles.root}>
        <View style={styles.stage} onLayout={onVideoLayout}>
          {videoEl}
          <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={styles.topShade} pointerEvents="none" />
          <View style={[styles.topBar, { paddingTop: topInset + 10 }]}>
            <View style={styles.topLeft}>
              <Pressable style={styles.backGlass} onPress={onBack} hitSlop={8}>
                <Icon name="chevronLeft" size={20} color="#fff" strokeWidth={2.1} />
              </Pressable>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.camNameGlass} numberOfLines={1}>{camera.name}</Text>
                <Text style={styles.camMetaGlass} numberOfLines={1}>{areaLabel(camera)}{res ? ` · ${res}` : ''}</Text>
              </View>
            </View>
            {badge}
          </View>

          {panelHidden ? (
            <Pressable style={[styles.restoreBtn, { bottom: 20 + insets.bottom }]} onPress={() => setPanelHidden(false)} hitSlop={8}>
              <Icon name="arrowUp" size={18} color="#fff" strokeWidth={2.2} />
              <Text style={styles.restoreText}>Controles</Text>
            </Pressable>
          ) : (
            <View style={[styles.panel, { bottom: 18 + insets.bottom }, landscape && styles.panelLandscape]}>
              <Pressable style={styles.minimizeHandle} onPress={() => setPanelHidden(true)} hitSlop={10}>
                <View style={styles.minimizeGrabber} />
                <Icon name="chevronDown" size={18} color="rgba(255,255,255,0.55)" strokeWidth={2.2} />
              </Pressable>
              {ptzFeedback ? (
                <View style={[styles.feedback, { backgroundColor: 'rgba(96,165,250,0.14)' }]}>
                  <Icon name="crosshair" size={14} color="#60a5fa" />
                  <Text style={styles.feedbackText}>{ptzFeedback}</Text>
                </View>
              ) : null}
              <View style={styles.ctrlRow}>
                <RecordButton recording={recordingActive} c={c} disabled={!canRecord} onPress={() => onToggleRecording(camera)} />
                <ControlButton label="Foto" icon="camera" c={c} onPress={() => onSnapshot(camera)} />
                <ControlButton label="Áudio" icon="mic" c={c} active={!muted} onPress={() => setMuted((m) => !m)} />
                <ControlButton label="Tela" icon="expand" c={c} active onPress={() => setFullscreen(false)} />
              </View>
              <PtzControls c={c} />
            </View>
          )}
        </View>
      </View>
    );
  }

  // ───────────────────────── RETRATO (vídeo + ações + timeline/ptz) ─────
  const c = tokensFor(false, theme);
  return (
    <View style={[styles.rootSheet, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: topInset + 4, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.headerBack, { backgroundColor: theme.surfaceAlt }]} onPress={onBack} hitSlop={8}>
          <Icon name="chevronLeft" size={20} color={theme.text} strokeWidth={2.1} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.headerName, { color: theme.text }]} numberOfLines={1}>{camera.name}</Text>
          <Text style={[styles.headerMeta, { color: theme.textSub }]} numberOfLines={1}>
            {areaLabel(camera)}{res ? ` · ${res}` : ''}
          </Text>
        </View>
        {badge}
      </View>

      <View style={[styles.videoFlush, { aspectRatio: aspect }]} onLayout={onVideoLayout}>
        {videoEl}
        {playing ? (
          <Pressable style={styles.closePlayback} onPress={onClosePlayback} hitSlop={8}>
            <Icon name="close" size={16} color="#fff" strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <RecordButton recording={recordingActive} c={c} disabled={!canRecord} onPress={() => onToggleRecording(camera)} />
        <ControlButton label="Foto" icon="camera" c={c} onPress={() => onSnapshot(camera)} />
        <ControlButton label="Áudio" icon="mic" c={c} active={!muted} onPress={() => setMuted((m) => !m)} />
        <ControlButton label="PTZ" icon="crosshair" c={c} active={lowerMode === 'ptz'} disabled={!canControl || playing} onPress={() => setLowerMode((m) => (m === 'ptz' ? 'timeline' : 'ptz'))} />
        <ControlButton label="Tela" icon="expand" c={c} onPress={() => setFullscreen(true)} />
      </View>

      <View style={[styles.lower, { borderTopColor: theme.border }]}>
        {lowerMode === 'ptz' && !playing ? (
          <View style={styles.ptzSheet}>
            {ptzFeedback ? (
              <View style={[styles.feedback, { backgroundColor: theme.accentBg, marginBottom: 16 }]}>
                <Icon name="crosshair" size={14} color={theme.accent} />
                <Text style={[styles.feedbackText, { color: theme.accent }]}>{ptzFeedback}</Text>
              </View>
            ) : null}
            <PtzControls c={c} centered />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={styles.daysRow}>
              <Pressable style={[styles.dayNav, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onPreviousDate} hitSlop={4}>
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
                hitSlop={4}
              >
                <Icon name="chevronRight" size={16} color={theme.textSub} strokeWidth={2.2} />
              </Pressable>
            </View>

            <Text style={[styles.listTitle, { color: theme.text }]}>Linha do tempo · {recordings.length}</Text>

            {recordings.length === 0 ? (
              <View style={[styles.empty, { borderColor: theme.border }]}>
                <Icon name="clock" size={22} color={theme.textMuted} strokeWidth={1.8} />
                <Text style={[styles.emptyText, { color: theme.textSub }]}>Nenhuma gravação neste dia.</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.listContent, { paddingBottom: 14 + insets.bottom }]} showsVerticalScrollIndicator={false}>
                {recordings.map((rec) => {
                  const active = activePlayback?.recording.id === rec.id;
                  const usable = rec.fileUsable !== false && rec.fileExists !== false;
                  return (
                    <Pressable
                      key={rec.id}
                      onPress={() => usable && onOpenPlayback(rec)}
                      style={[styles.recRow, { backgroundColor: active ? theme.accentBg : theme.surface, borderColor: active ? theme.accent : theme.border }, !usable && { opacity: 0.5 }]}
                    >
                      <View style={[styles.recThumb, { backgroundColor: active ? theme.accent : theme.surfaceAlt }]}>
                        <Icon name="play" size={15} color={active ? '#fff' : theme.textSub} fill={active} />
                      </View>
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
                      <Pressable onPress={() => usable && onDownloadRecording(rec)} hitSlop={8} disabled={!usable}>
                        <Icon name="download" size={19} color={theme.accent} strokeWidth={2} />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// Botão de gravação que reflete o estado REAL: cinza = parado, vermelho cheio
// com quadrado (stop) = gravando.
function RecordButton({ recording, disabled, onPress, c }: {
  recording: boolean; disabled?: boolean; onPress: () => void; c: ControlTokens;
}) {
  return (
    <Pressable style={[styles.ctrl, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled}>
      <View style={[
        styles.ctrlCircle,
        recording
          ? { backgroundColor: '#ef4444', borderColor: '#ef4444' }
          : { backgroundColor: c.surface, borderColor: c.border },
      ]}>
        {recording ? <View style={styles.recStop} /> : <View style={styles.recDot} />}
      </View>
      <Text style={[styles.ctrlLabel, { color: recording ? '#ef4444' : c.sub }]}>
        {recording ? 'Gravando' : 'Gravar'}
      </Text>
    </Pressable>
  );
}

function ControlButton({ label, icon, danger, active, disabled, onPress, c }: {
  label: string; icon?: IconName; danger?: boolean; active?: boolean; disabled?: boolean; onPress: () => void; c: ControlTokens;
}) {
  return (
    <Pressable style={[styles.ctrl, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled}>
      <View style={[
        styles.ctrlCircle,
        { backgroundColor: c.surface, borderColor: c.border },
        danger && styles.ctrlDanger,
        active && styles.ctrlActive,
      ]}>
        {danger ? <View style={styles.recDot} /> : icon ? <Icon name={icon} size={22} color={active ? '#fff' : c.text} /> : null}
      </View>
      <Text style={[styles.ctrlLabel, { color: active ? '#60a5fa' : c.sub }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  videoFill: { flex: 1, backgroundColor: '#000' },
  videoEmpty: { backgroundColor: '#070809' },
  videoEmptyTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  videoEmptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24 },

  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.92)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 9 },
  liveBadgeIdle: { backgroundColor: 'rgba(20,24,31,0.8)', borderWidth: 1, borderColor: GLASS_BORDER },
  recBadge: { backgroundColor: '#2563eb' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Imersivo
  root: { flex: 1, backgroundColor: '#070809' },
  stage: { flex: 1, position: 'relative', backgroundColor: '#070809' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, gap: 10 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 11, flexShrink: 1 },
  backGlass: { width: 38, height: 38, borderRadius: 12, backgroundColor: GLASS_SURFACE, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: 'center', justifyContent: 'center' },
  camNameGlass: { color: '#fff', fontSize: 16, fontWeight: '800' },
  camMetaGlass: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5, fontWeight: '600' },
  panel: { position: 'absolute', left: 18, right: 18, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 18, borderRadius: 26, backgroundColor: 'rgba(20,24,31,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  panelLandscape: { left: undefined, right: 14, bottom: 14, width: 300 },
  minimizeHandle: { alignItems: 'center', justifyContent: 'center', paddingBottom: 6, gap: 1 },
  minimizeGrabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  restoreBtn: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(20,24,31,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
  restoreText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },

  // Retrato
  rootSheet: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBack: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  headerName: { fontSize: 15.5, fontWeight: '800' },
  headerMeta: { fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  videoFlush: { width: '100%', backgroundColor: '#070809', position: 'relative' },
  closePlayback: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },

  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 14, paddingHorizontal: 10 },
  lower: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 14 },
  ptzSheet: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  ctrl: { alignItems: 'center', gap: 6 },
  ctrlCircle: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ctrlDanger: { backgroundColor: 'rgba(239,68,68,0.16)', borderColor: 'rgba(239,68,68,0.4)' },
  ctrlActive: { backgroundColor: 'rgba(59,130,246,0.28)', borderColor: 'rgba(59,130,246,0.6)' },
  recDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444' },
  recStop: { width: 16, height: 16, borderRadius: 4, backgroundColor: '#fff' },
  ctrlLabel: { fontSize: 10, fontWeight: '700' },

  feedback: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 11 },
  feedbackText: { color: '#bfdbfe', fontSize: 12, fontWeight: '700' },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  ptzRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ptzRowCentered: { justifyContent: 'center' },
  ptzPad: { width: 124, height: 124, borderRadius: 62, borderWidth: 1, position: 'relative' },
  ptzArrow: { position: 'absolute', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ptzArrowActive: { backgroundColor: 'rgba(59,130,246,0.4)' },
  ptzCenter: { position: 'absolute', top: 39, left: 39, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  ptzSide: { flex: 1, gap: 9, maxWidth: 200 },
  zoomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14 },
  zoomLabel: { fontSize: 13, fontWeight: '700' },
  zoomCtrls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoomBtn: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  zoomBtnActive: { backgroundColor: 'rgba(59,130,246,0.5)' },
  hintBar: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14 },
  hintText: { fontSize: 12.5, fontWeight: '700' },

  // Timeline / gravações
  daysRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch', marginBottom: 12 },
  dayNav: { width: 44, height: 42, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  dayPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  dayPillText: { fontSize: 13.5, fontWeight: '800' },
  listTitle: { fontSize: 13, fontWeight: '800', marginBottom: 9 },
  listContent: { gap: 8 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 26, paddingHorizontal: 20, alignItems: 'center', gap: 8, marginTop: 4 },
  emptyText: { fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 12 },
  recThumb: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recRange: { fontSize: 13, fontWeight: '700' },
  recMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  recDuration: { fontSize: 11, fontWeight: '600' },
  recTag: { fontSize: 9.5, fontWeight: '800', paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6, overflow: 'hidden' },
});
