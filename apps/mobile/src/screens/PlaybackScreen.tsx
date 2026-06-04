import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { PlaybackVideo } from '../components/VideoPlayers';
import { SvgIcon } from '../components/SvgIcon';
import { DateCarousel } from '../components/DateCarousel';
import type { DateItem } from '../components/DateCarousel';
import { styles } from '../styles/appStyles';
import { C } from '../styles/colors';
import type { ActivePlayback, Camera, Recording } from '../types';
import { formatBytes, formatDateLabel, formatDuration, formatTime, isOnline } from '../utils/format';

type FilterType = 'all' | 'motion' | 'manual';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',    label: 'Tudo' },
  { key: 'motion', label: 'Movimento' },
  { key: 'manual', label: 'Manual' },
];

interface PlaybackScreenProps {
  cameras: Camera[];
  selectedCamera: Camera | null;
  streamPosters: Record<string, string | null>;
  recordings: Recording[];
  activePlayback: ActivePlayback | null;
  onSelectCamera: (cameraId: string) => void;
  onOpenPlayback: (recording: Recording) => void;
  onClosePlayback: () => void;
  onDownloadRecording: (recording: Recording) => void;
  recordingDate: string;
  onPreviousDate: () => void;
  onNextDate: () => void;
}

export function PlaybackScreen({
  cameras,
  selectedCamera,
  streamPosters,
  recordings,
  activePlayback,
  onSelectCamera,
  onOpenPlayback,
  onClosePlayback,
  onDownloadRecording,
  recordingDate,
  onPreviousDate,
  onNextDate,
}: PlaybackScreenProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Build the 7-day carousel — selected = the currently loaded date
  const dayCarousel = useMemo<DateItem[]>(() => {
    const base = new Date(`${recordingDate}T12:00:00`);
    return Array.from({ length: 7 }, (_, index) => {
      const d = new Date(base);
      d.setDate(base.getDate() - (6 - index));
      const key = d.toISOString().slice(0, 10);
      const isSelected = key === recordingDate;
      return {
        key,
        day: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        date: d.getDate(),
        hasRecordings: isSelected && recordings.length > 0,
        selected: isSelected,
      };
    });
  }, [recordingDate, recordings.length]);

  // Navigate to a carousel date via available prev/next handlers
  function handleSelectDate(key: string) {
    const current = new Date(`${recordingDate}T12:00:00`);
    const target  = new Date(`${key}T12:00:00`);
    const diff    = Math.round((target.getTime() - current.getTime()) / 86_400_000);
    if (diff < 0) for (let i = 0; i < -diff; i++) onPreviousDate();
    else if (diff > 0) for (let i = 0; i < diff; i++) onNextDate();
  }

  const filtered = useMemo(
    () => (activeFilter === 'all' ? recordings : recordings),
    [recordings, activeFilter],
  );

  const thumbUri = selectedCamera ? (streamPosters[selectedCamera.id] ?? null) : null;

  return (
    <View style={styles.page}>

      {/* ── Header ─────────────────────────────────────────── */}
      <View>
        <Text style={styles.recordingsTitle}>Gravações</Text>
        <Text style={styles.recordingsSubtitle}>
          Selecione uma câmera para ver os arquivos salvos e histórico.
        </Text>
      </View>

      {/* ── Camera selector chips (horizontal scroll) ───────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cameraSelectorRow}
      >
        {cameras.map((camera) => {
          const online = isOnline(camera);
          const active = selectedCamera?.id === camera.id;
          return (
            <Pressable
              key={camera.id}
              onPress={() => onSelectCamera(camera.id)}
              style={[styles.cameraSelectorChip, active && styles.cameraSelectorChipActive]}
            >
              <View
                style={[
                  styles.cameraSelectorDot,
                  { backgroundColor: active ? '#fff' : online ? C.success : C.danger },
                ]}
              />
              <Text style={[styles.cameraSelectorText, active && styles.cameraSelectorTextActive]}>
                {camera.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── DateCarousel ────────────────────────────────────── */}
      <DateCarousel dates={dayCarousel} onSelect={handleSelectDate} />

      {/* ── Timeline ruler ──────────────────────────────────── */}
      {selectedCamera ? (
        <View style={styles.replayTimelineRuler}>
          <View style={styles.replayTimelineLabels}>
            {['00:00', '06:00', '12:00', '18:00', '24:00'].map((label) => (
              <Text key={label} style={styles.replayTimelineLabel}>{label}</Text>
            ))}
          </View>
          <View style={styles.replayTicks}>
            {Array.from({ length: 41 }).map((_, i) => (
              <View key={i} style={[styles.replayTick, i % 10 === 0 && styles.replayTickMajor]} />
            ))}
          </View>
          <View style={styles.replayTrack}>
            <View style={[styles.replayTrackSegmentBlue,   { flex: 10 }]} />
            <View style={styles.replayTrackGap} />
            <View style={[styles.replayTrackSegmentOrange, { flex: 15 }]} />
            <View style={[styles.replayTrackSegmentBlue,   { flex: 20 }]} />
            <View style={styles.replayTrackGap} />
            <View style={[styles.replayTrackSegmentOrange, { flex: 8  }]} />
            <View style={[styles.replayTrackSegmentBlue,   { flex: 40 }]} />
          </View>
          <View style={styles.replayPlayhead}>
            <View style={styles.replayPlayheadCap} />
          </View>
        </View>
      ) : null}

      {/* ── Playback player ─────────────────────────────────── */}
      {activePlayback ? (
        <View style={styles.playbackPlayerCard}>
          <View style={styles.playbackHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.playbackTitle}>Reprodução</Text>
              <Text style={{ color: C.textSub, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                {formatTime(activePlayback.recording.startedAt)} → {formatTime(activePlayback.recording.endedAt)}
              </Text>
            </View>
            <Pressable onPress={onClosePlayback} style={styles.closePlaybackButton}>
              <Text style={styles.closePlaybackText}>Fechar</Text>
            </Pressable>
          </View>
          <View style={styles.cloudReplayStage}>
            <PlaybackVideo uri={activePlayback.url} style={styles.playbackVideo} />
            <View style={styles.cloudReplayTopBar}>
              <Text style={styles.cloudReplayBadge}>REPRODUÇÃO</Text>
              <Text style={styles.cloudReplayTime}>
                {formatDuration(activePlayback.recording.durationSeconds)}
              </Text>
            </View>
          </View>
          <View style={styles.rowButtons}>
            <Pressable
              onPress={() => onDownloadRecording(activePlayback.recording)}
              style={styles.smallButton}
            >
              <Text style={styles.smallButtonText}>Baixar</Text>
            </Pressable>
            <Pressable onPress={onClosePlayback} style={styles.smallButtonDark}>
              <Text style={styles.smallButtonDarkText}>Voltar para lista</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ── Content when a camera is selected ───────────────── */}
      {selectedCamera ? (
        <>
          {/* Filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.replayFilterRow}
          >
            {FILTERS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setActiveFilter(f.key)}
                style={[
                  styles.replayFilterChip,
                  activeFilter === f.key && styles.replayFilterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.replayFilterText,
                    activeFilter === f.key && styles.replayFilterTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filtered.length > 0 ? (
            <>
              {/* Grid header */}
              <View style={styles.replayGridHeader}>
                <Text style={styles.replayGridDate}>{formatDateLabel(recordingDate)}</Text>
                <Text style={styles.replayGridCount}>
                  {filtered.length} evento{filtered.length !== 1 ? 's' : ''}
                </Text>
              </View>

              {/* 3-column event grid (reference 2 style) */}
              <View style={styles.replayEventGrid}>
                {filtered.map((rec) => (
                  <Pressable
                    key={rec.id}
                    onPress={() => onOpenPlayback(rec)}
                    style={styles.replayEventCard}
                  >
                    <View style={styles.replayEventThumb}>
                      {thumbUri ? (
                        <Image
                          source={{ uri: thumbUri }}
                          style={styles.recordingPreviewImage}
                        />
                      ) : null}
                      <View style={styles.recordingPreviewShade} />
                      <View style={styles.replayEventIcon}>
                        <SvgIcon name="move" size={12} color="#ffffff" />
                      </View>
                      <View style={styles.replayEventPlay}>
                        <SvgIcon name="play" size={18} color="#ffffff" />
                      </View>
                    </View>
                    <View style={styles.replayEventFooter}>
                      <Text style={styles.replayEventTime}>{formatTime(rec.startedAt)}</Text>
                      <Pressable
                        onPress={() => onDownloadRecording(rec)}
                        style={styles.replayEventDownload}
                      >
                        <SvgIcon name="download" size={13} color="#6b7280" />
                      </Pressable>
                    </View>
                    <Text style={styles.replayEventMeta}>
                      {formatDuration(rec.durationSeconds)} · {formatBytes(rec.sizeBytes)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Vertical event timeline (reference 1 style) */}
              <View style={styles.eventTimeline}>
                {filtered.map((rec, index) => {
                  const isFirst = index === 0;
                  const isLast  = index === filtered.length - 1;
                  return (
                    <Pressable
                      key={`tl-${rec.id}`}
                      onPress={() => onOpenPlayback(rec)}
                      style={styles.eventTimelineItem}
                    >
                      {/* Time column */}
                      <View style={styles.eventTimelineTime}>
                        <Text style={styles.eventTimelineTimeText}>
                          {formatTime(rec.startedAt)}
                        </Text>
                      </View>

                      {/* Dot + connecting line column */}
                      <View style={styles.eventTimelineLineCol}>
                        {/* Line above dot (hidden for first item) */}
                        {!isFirst && (
                          <View style={[styles.eventTimelineLine, { bottom: '50%' }]} />
                        )}
                        {/* Line below dot (hidden for last item) */}
                        {!isLast && (
                          <View style={[styles.eventTimelineLine, { top: '50%' }]} />
                        )}
                        <View style={[styles.eventTimelineDot, styles.eventTimelineDotActive]} />
                      </View>

                      {/* Content column */}
                      <View style={styles.eventTimelineContent}>
                        <View style={styles.eventTimelineHeader}>
                          <View style={styles.eventTimelineInfo}>
                            <SvgIcon name="video" size={14} color={C.accent} />
                            <Text style={[styles.eventTimelineTitle, styles.eventTimelineTitleActive]}>
                              Gravação · {formatDuration(rec.durationSeconds)}
                            </Text>
                          </View>

                          {/* Thumbnail */}
                          <View style={styles.eventTimelineThumb}>
                            {thumbUri ? (
                              <Image
                                source={{ uri: thumbUri }}
                                style={styles.eventTimelineThumbImg}
                              />
                            ) : null}
                            <View style={styles.eventTimelineThumbOverlay}>
                              <View style={styles.eventTimelinePlayBadge}>
                                <SvgIcon name="play" size={10} color="#fff" />
                                <Text style={styles.eventTimelinePlayBadgeText}>PLAY</Text>
                              </View>
                            </View>
                            <View style={styles.eventTimelineDuration}>
                              <Text style={styles.eventTimelineDurationText}>
                                {formatDuration(rec.durationSeconds)}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <Text style={styles.replayEventMeta}>
                          {formatTime(rec.startedAt)} → {formatTime(rec.endedAt)} · {formatBytes(rec.sizeBytes)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Sem gravações</Text>
              <Text style={styles.emptyText}>
                Não há gravações para esta câmera no dia selecionado.
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Selecione uma câmera</Text>
          <Text style={styles.emptyText}>
            Toque em uma câmera acima para ver gravações e histórico.
          </Text>
        </View>
      )}

    </View>
  );
}
