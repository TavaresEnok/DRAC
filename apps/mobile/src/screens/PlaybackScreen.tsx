import { useMemo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { PlaybackVideo } from '../components/VideoPlayers';
import { SvgIcon } from '../components/SvgIcon';
import { styles } from '../styles/appStyles';
import type { ActivePlayback, Camera, Recording } from '../types';
import { formatBytes, formatDateLabel, formatDuration, formatTime } from '../utils/format';

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
  const dayCarousel = useMemo(() => {
    const base = new Date(`${recordingDate}T12:00:00`);
    return Array.from({ length: 7 }, (_, index) => {
      const next = new Date(base);
      next.setDate(base.getDate() - (6 - index));
      return {
        key: next.toISOString().slice(0, 10),
        day: next.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        date: next.getDate(),
        active: index === 6,
      };
    });
  }, [recordingDate]);

  return (
    <View style={styles.page}>
      <View>
        <Text style={styles.recordingsTitle}>Gravações</Text>
        <Text style={styles.recordingsSubtitle}>Selecione uma câmera para ver os arquivos salvos e histórico.</Text>
      </View>

      <View style={styles.recordingCameraList}>
        {cameras.map((camera) => (
          <Pressable
            key={camera.id}
            onPress={() => onSelectCamera(camera.id)}
            style={[styles.recordingCameraCard, selectedCamera?.id === camera.id && styles.recordingCameraCardActive]}
          >
            <View style={styles.recordingCameraThumb}>
              {streamPosters[camera.id] ? <Image source={{ uri: streamPosters[camera.id] ?? undefined }} style={styles.recordingCameraImage} /> : <SvgIcon name="camera" size={24} color="#475569" />}
              {camera.canRecord ? <View style={styles.recordDot} /> : null}
            </View>
            <View style={styles.recordingCameraBody}>
              <Text style={styles.recordingCameraTitle}>{camera.name}</Text>
              <Text style={styles.recordingCameraMeta}>{camera.group?.name ?? 'Sem grupo'}</Text>
              <View style={styles.recordingCameraHistory}>
                <SvgIcon name="calendar" size={12} color="#2563eb" />
                <Text style={styles.recordingCameraHistoryText}>Ver Histórico</Text>
              </View>
            </View>
            <View style={styles.recordingCameraArrow}><Text style={styles.recordingCameraArrowText}>›</Text></View>
          </Pressable>
        ))}
      </View>

      {activePlayback ? (
        <View style={styles.playbackPlayerCard}>
          <View style={styles.playbackHeader}>
            <View>
              <Text style={styles.playbackTitle}>Cloud Replay</Text>
              <Text style={styles.cameraMeta}>
                {formatTime(activePlayback.recording.startedAt)} - {formatTime(activePlayback.recording.endedAt)}
              </Text>
            </View>
            <Pressable onPress={onClosePlayback} style={styles.closePlaybackButton}>
              <Text style={styles.closePlaybackText}>Fechar</Text>
            </Pressable>
          </View>
          <View style={styles.cloudReplayStage}>
            <PlaybackVideo uri={activePlayback.url} style={styles.playbackVideo} />
            <View style={styles.cloudReplayTopBar}>
              <Text style={styles.cloudReplayBadge}>CLOUD REPLAY</Text>
              <Text style={styles.cloudReplayTime}>{formatDuration(activePlayback.recording.durationSeconds)}</Text>
            </View>
          </View>
          <View style={styles.rowButtons}>
            <Pressable onPress={() => onDownloadRecording(activePlayback.recording)} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Baixar esta gravação</Text>
            </Pressable>
            <Pressable onPress={onClosePlayback} style={styles.smallButtonDark}>
              <Text style={styles.smallButtonDarkText}>Voltar para lista</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {selectedCamera ? (
        <View style={styles.dateCard}>
          <Pressable onPress={onPreviousDate} style={styles.dateNavButton}>
            <Text style={styles.dateNavButtonText}>‹</Text>
          </Pressable>
          <View style={styles.dateCardCenter}>
            <SvgIcon name="calendar" size={18} color="#2563eb" />
            <Text style={styles.dateCardText}>{formatDateLabel(recordingDate)}</Text>
          </View>
          <Pressable onPress={onNextDate} style={styles.dateNavButton}>
            <Text style={styles.dateNavButtonText}>›</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.replayDaysRow}>
        {dayCarousel.map((day) => (
          <View key={day.key} style={[styles.replayDayPill, day.active && styles.replayDayPillActive]}>
            <Text style={[styles.replayDayName, day.active && styles.replayDayNameActive]}>{day.day}</Text>
            <Text style={[styles.replayDayNumber, day.active && styles.replayDayNumberActive]}>{day.date}</Text>
          </View>
        ))}
      </View>

      <View style={styles.replayTimelineRuler}>
        <View style={styles.replayTimelineLabels}>
          <Text style={styles.replayTimelineLabel}>00:00</Text>
          <Text style={styles.replayTimelineLabel}>06:00</Text>
          <Text style={styles.replayTimelineLabel}>12:00</Text>
          <Text style={styles.replayTimelineLabel}>18:00</Text>
          <Text style={styles.replayTimelineLabel}>24:00</Text>
        </View>
        <View style={styles.replayTicks}>
          {Array.from({ length: 41 }).map((_, index) => (
            <View key={index} style={[styles.replayTick, index % 10 === 0 && styles.replayTickMajor]} />
          ))}
        </View>
        <View style={styles.replayTrack}>
          <View style={[styles.replayTrackSegmentBlue, { flex: 10 }]} />
          <View style={styles.replayTrackGap} />
          <View style={[styles.replayTrackSegmentOrange, { flex: 15 }]} />
          <View style={[styles.replayTrackSegmentBlue, { flex: 20 }]} />
          <View style={styles.replayTrackGap} />
          <View style={[styles.replayTrackSegmentOrange, { flex: 8 }]} />
          <View style={[styles.replayTrackSegmentBlue, { flex: 40 }]} />
        </View>
        <View style={styles.replayPlayhead}><View style={styles.replayPlayheadCap} /></View>
      </View>

      <View style={styles.replayFilterRow}>
        <View style={styles.replayFilterActive}><Text style={styles.replayFilterActiveText}>Tudo</Text></View>
        <View style={styles.replayFilter}><Text style={styles.replayFilterText}>Detecção de movimento</Text></View>
      </View>

      <View style={styles.replayGridHeader}>
        <Text style={styles.replayGridDate}>{formatDateLabel(recordingDate)}</Text>
        <Text style={styles.replayGridCount}>{recordings.length} eventos</Text>
      </View>

      <View style={styles.replayEventGrid}>
        {recordings.map((recording) => (
          <Pressable key={recording.id} onPress={() => onOpenPlayback(recording)} style={styles.replayEventCard}>
            <View style={styles.replayEventThumb}>
              {selectedCamera && streamPosters[selectedCamera.id] ? <Image source={{ uri: streamPosters[selectedCamera.id] ?? undefined }} style={styles.recordingPreviewImage} /> : null}
              <View style={styles.recordingPreviewShade} />
              <View style={styles.replayEventIcon}><SvgIcon name="move" size={12} color="#ffffff" /></View>
              <View style={styles.replayEventPlay}><SvgIcon name="play" size={18} color="#ffffff" /></View>
            </View>
            <View style={styles.replayEventFooter}>
              <Text style={styles.replayEventTime}>{formatTime(recording.startedAt)}</Text>
              <Pressable onPress={() => onDownloadRecording(recording)} style={styles.replayEventDownload}>
                <SvgIcon name="download" size={13} color="#6b7280" />
              </Pressable>
            </View>
            <Text style={styles.replayEventMeta}>{formatDuration(recording.durationSeconds)} · {formatBytes(recording.sizeBytes)}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.recordingTimelineCompact}>
        {recordings.slice(0, 3).map((recording) => (
          <View key={`compact-${recording.id}`} style={styles.recordingTimelineItem}>
            <View style={styles.recordingTimelineDot} />
            <View style={styles.recordingTimelineContent}>
              <View style={styles.recordingTimelineTop}>
                <View>
                  <Text style={styles.recordingTimelineTime}>{formatTime(recording.startedAt)} - {formatTime(recording.endedAt)}</Text>
                  <Text style={styles.recordingTimelineEvent}>{formatDuration(recording.durationSeconds)} · {formatBytes(recording.sizeBytes)}</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>
      {!recordings.length ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sem gravações hoje</Text>
          <Text style={styles.emptyText}>Troque a câmera acima ou atualize para buscar novos segmentos.</Text>
        </View>
      ) : null}
    </View>
  );
}
