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
                <SvgIcon name="calendar" size={12} color="#34d399" />
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
            <SvgIcon name="calendar" size={18} color="#34d399" />
            <Text style={styles.dateCardText}>{formatDateLabel(recordingDate)}</Text>
          </View>
          <Pressable onPress={onNextDate} style={styles.dateNavButton}>
            <Text style={styles.dateNavButtonText}>›</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.recordingTimeline}>
        {recordings.map((recording) => (
          <View key={recording.id} style={styles.recordingTimelineItem}>
            <View style={styles.recordingTimelineDot} />
            <View style={styles.recordingTimelineContent}>
              <View style={styles.recordingTimelineTop}>
                <View>
                  <Text style={styles.recordingTimelineTime}>{formatTime(recording.startedAt)} - {formatTime(recording.endedAt)}</Text>
                  <Text style={styles.recordingTimelineEvent}>{formatDuration(recording.durationSeconds)} · {formatBytes(recording.sizeBytes)}</Text>
                </View>
                <Pressable onPress={() => onDownloadRecording(recording)} style={styles.downloadCircle}>
                  <SvgIcon name="download" size={18} color="#cbd5e1" />
                </Pressable>
              </View>
              <Pressable onPress={() => onOpenPlayback(recording)} style={styles.recordingPreview}>
                {selectedCamera && streamPosters[selectedCamera.id] ? <Image source={{ uri: streamPosters[selectedCamera.id] ?? undefined }} style={styles.recordingPreviewImage} /> : null}
                <View style={styles.recordingPreviewShade} />
                <View style={styles.recordingCloudBadge}>
                  <Text style={styles.recordingCloudBadgeText}>Cloud Replay</Text>
                </View>
                <View style={styles.recordingPlayOuter}>
                  <View style={styles.recordingPlayCircle}><SvgIcon name="play" size={23} color="#02130f" /></View>
                  <Text style={styles.recordingPlayLabel}>Reproduzir</Text>
                </View>
                <Text style={styles.recordingDurationBadge}>{formatDuration(recording.durationSeconds)}</Text>
              </Pressable>
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
