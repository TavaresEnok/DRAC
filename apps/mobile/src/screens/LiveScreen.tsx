import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { LiveVideo, type LiveStatus } from '../components/VideoPlayers';
import { DetectionOverlay } from '../components/DetectionOverlay';
import { PtzButton } from '../components/PtzButton';
import { SvgIcon } from '../components/SvgIcon';
import { styles } from '../styles/appStyles';
import type { Camera, Direction, LiveDetection } from '../types';
import { isOnline } from '../utils/format';

const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  idle: 'SEM SINAL',
  connecting: '◌ CONECTANDO',
  live: '● AO VIVO',
  reconnecting: '◌ RECONECTANDO',
  offline: 'SEM SINAL',
};

interface LiveScreenProps {
  selectedCamera: Camera | null;
  streamUrl: string | null;
  whepUrl: string | null;
  posterUrl: string | null;
  detections: LiveDetection[];
  showPtz: boolean;
  ptzActive: Direction | null;
  ptzFeedback: string | null;
  onBack: () => void;
  onTogglePtz: () => void;
  onSendPtz: (direction: Direction) => void;
  onStartRecording: (camera: Camera) => void;
}

export function LiveScreen({
  selectedCamera,
  streamUrl,
  whepUrl,
  posterUrl,
  detections,
  showPtz,
  ptzActive,
  ptzFeedback,
  onBack,
  onTogglePtz,
  onSendPtz,
  onStartRecording,
}: LiveScreenProps) {
  if (!selectedCamera) {
    return (
      <View style={styles.page}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Selecione uma câmera</Text>
          <Text style={styles.emptyText}>
            Volte em Câmeras e toque em uma câmera para abrir o ao vivo.
          </Text>
        </View>
      </View>
    );
  }

  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const online = isOnline(selectedCamera);
  const canOpenLive = online && Boolean(streamUrl);
  const isLive = liveStatus === 'live';

  const onVideoLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setVideoSize((current) => (current.width === width && current.height === height ? current : { width, height }));
  };

  return (
    <View style={styles.page}>
      <View style={styles.cameraStage}>

        {/* ── Header ─────────────────────────────────────── */}
        <View style={styles.cameraDetailHeader}>
          <Pressable onPress={onBack} style={styles.headerIconButton}>
            <SvgIcon name="chevronLeft" size={28} color="#374151" />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.cameraDetailTitle}>{selectedCamera.name}</Text>
            <Text style={styles.cameraDetailSubtitle}>
              {online ? 'Conectado' : 'Offline'}
            </Text>
          </View>
          <View style={styles.headerIconButton} />
        </View>

        {/* ── Player Edge-to-Edge ─────────────────────────── */}
        <View style={styles.singleVideoCard} onLayout={onVideoLayout}>
          <LiveVideo
            uri={streamUrl}
            whepUri={whepUrl}
            posterUri={posterUrl}
            videoStyle={styles.video}
            emptyStyle={styles.videoEmpty}
            posterStyle={styles.videoPoster}
            emptyTitleStyle={styles.videoEmptyTitle}
            emptyTextStyle={styles.videoEmptyText}
            onStatusChange={setLiveStatus}
          />

          {isLive ? (
            <DetectionOverlay
              detections={detections}
              containerWidth={videoSize.width}
              containerHeight={videoSize.height}
              fallbackWidth={selectedCamera.detectedWidth}
              fallbackHeight={selectedCamera.detectedHeight}
            />
          ) : null}

          {/* Badge de status real + protocolo */}
          <View style={styles.singleVideoTopOverlay}>
            <Text style={[styles.liveNowText, !isLive && styles.liveNowTextIdle]}>
              {LIVE_STATUS_LABEL[liveStatus]}
            </Text>
            <Text style={styles.videoProtocol}>{isLive ? 'HLS' : ''}</Text>
          </View>

          {/* Ações flutuantes – lado direito */}
          <View style={styles.liveVideoSideActions}>
            <Pressable
              disabled={!selectedCamera.canRecord}
              onPress={() => onStartRecording(selectedCamera)}
              style={[styles.liveVideoRoundAction, !selectedCamera.canRecord && styles.disabled]}
            >
              <SvgIcon name="video" size={18} color="#ffffff" />
            </Pressable>
            <Pressable
              disabled={!selectedCamera.canControl}
              onPress={onTogglePtz}
              style={[
                styles.liveVideoRoundAction,
                showPtz && styles.liveVideoRoundActionActive,
                !selectedCamera.canControl && styles.disabled,
              ]}
            >
              <SvgIcon name="move" size={18} color="#ffffff" />
            </Pressable>
          </View>

          {/* Controles inferiores */}
          <View style={styles.liveVideoBottomControls}>
            <Text style={styles.liveSpeedText}>1.0×</Text>
            <SvgIcon name="video" size={19} color="rgba(255,255,255,0.70)" />
          </View>

          {/* PTZ Overlay */}
          {showPtz ? (
            <View style={styles.ptzVideoOverlay}>
              <Pressable onPress={onTogglePtz} style={styles.ptzOverlayClose}>
                <Text style={styles.ptzOverlayCloseText}>✕</Text>
              </Pressable>
              <Text style={styles.ptzOverlayTitle}>Controle PTZ</Text>
              {ptzFeedback ? (
                <Text style={styles.ptzOverlayFeedback}>→ {ptzFeedback}</Text>
              ) : null}
              <View style={styles.ptzOverlayDpad}>
                <PtzButton
                  label="⌃" direction="Up"
                  disabled={!selectedCamera.canControl} active={ptzActive === 'Up'}
                  onPress={onSendPtz} style={styles.ptzOverlayUp}
                  buttonStyle={styles.ptzOverlayButton} activeButtonStyle={styles.ptzOverlayButtonActive}
                  disabledStyle={styles.disabled} textStyle={styles.ptzOverlayButtonText} activeTextStyle={styles.ptzOverlayButtonTextActive}
                />
                <PtzButton
                  label="⌄" direction="Down"
                  disabled={!selectedCamera.canControl} active={ptzActive === 'Down'}
                  onPress={onSendPtz} style={styles.ptzOverlayDown}
                  buttonStyle={styles.ptzOverlayButton} activeButtonStyle={styles.ptzOverlayButtonActive}
                  disabledStyle={styles.disabled} textStyle={styles.ptzOverlayButtonText} activeTextStyle={styles.ptzOverlayButtonTextActive}
                />
                <PtzButton
                  label="‹" direction="Left"
                  disabled={!selectedCamera.canControl} active={ptzActive === 'Left'}
                  onPress={onSendPtz} style={styles.ptzOverlayLeft}
                  buttonStyle={styles.ptzOverlayButton} activeButtonStyle={styles.ptzOverlayButtonActive}
                  disabledStyle={styles.disabled} textStyle={styles.ptzOverlayButtonText} activeTextStyle={styles.ptzOverlayButtonTextActive}
                />
                <PtzButton
                  label="›" direction="Right"
                  disabled={!selectedCamera.canControl} active={ptzActive === 'Right'}
                  onPress={onSendPtz} style={styles.ptzOverlayRight}
                  buttonStyle={styles.ptzOverlayButton} activeButtonStyle={styles.ptzOverlayButtonActive}
                  disabledStyle={styles.disabled} textStyle={styles.ptzOverlayButtonText} activeTextStyle={styles.ptzOverlayButtonTextActive}
                />
                <View style={styles.ptzOverlayNub}>
                  <View style={styles.ptzOverlayNubInner} />
                </View>
              </View>
            </View>
          ) : null}
        </View>

        {/* ── Quick Actions ───────────────────────────────── */}
        <View style={styles.quickActionsGrid}>
          {/* Gravar */}
          <Pressable
            disabled={!selectedCamera.canRecord}
            onPress={() => onStartRecording(selectedCamera)}
            style={[styles.quickActionButton, !selectedCamera.canRecord && styles.disabled]}
          >
            <View style={styles.quickActionIcon}>
              <SvgIcon name="video" size={22} color="#6b7280" />
            </View>
            <Text style={styles.quickActionLabel}>Gravar</Text>
            {!selectedCamera.canRecord ? <Text style={styles.quickActionMeta}>Sem permissão</Text> : null}
          </Pressable>

          {/* PTZ */}
          <Pressable
            disabled={!selectedCamera.canControl}
            onPress={onTogglePtz}
            style={[styles.quickActionButton, !selectedCamera.canControl && styles.disabled]}
          >
            <View style={[styles.quickActionIcon, showPtz && styles.quickActionIconActive]}>
              <SvgIcon name="move" size={22} color={showPtz ? '#ffffff' : '#6b7280'} />
            </View>
            <Text style={styles.quickActionLabel}>PTZ</Text>
            {!selectedCamera.canControl ? <Text style={styles.quickActionMeta}>Sem permissão</Text> : null}
          </Pressable>
        </View>

      </View>
    </View>
  );
}
