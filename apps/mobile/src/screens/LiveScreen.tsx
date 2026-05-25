import { Pressable, Text, View } from 'react-native';
import { LiveVideo } from '../components/VideoPlayers';
import { PtzButton } from '../components/PtzButton';
import { SvgIcon } from '../components/SvgIcon';
import { styles } from '../styles/appStyles';
import type { Camera, Direction } from '../types';
import { isOnline } from '../utils/format';

interface LiveScreenProps {
  selectedCamera: Camera | null;
  streamUrl: string | null;
  posterUrl: string | null;
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
  posterUrl,
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

  const online = isOnline(selectedCamera);

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
          {/* Botão de settings desabilitado (em breve) */}
          <View style={[styles.headerIconButton, styles.disabled]}>
            <SvgIcon name="settings" size={22} color="#9ca3af" />
          </View>
        </View>

        {/* ── Player Edge-to-Edge ─────────────────────────── */}
        <View style={styles.singleVideoCard}>
          <LiveVideo
            uri={streamUrl}
            posterUri={posterUrl}
            videoStyle={styles.video}
            emptyStyle={styles.videoEmpty}
            posterStyle={styles.videoPoster}
            emptyTitleStyle={styles.videoEmptyTitle}
            emptyTextStyle={styles.videoEmptyText}
          />

          {/* Badge AO VIVO + protocolo */}
          <View style={styles.singleVideoTopOverlay}>
            <Text style={styles.liveNowText}>● AO VIVO</Text>
            <Text style={styles.videoProtocol}>HLS</Text>
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
          {/* Falar — em breve */}
          <Pressable disabled style={[styles.quickActionButton, styles.disabled]}>
            <View style={styles.quickActionIcon}>
              <SvgIcon name="mic" size={22} color="#9ca3af" />
            </View>
            <Text style={styles.quickActionLabel}>Falar</Text>
            <Text style={styles.quickActionSoon}>Em breve</Text>
          </Pressable>

          {/* Foto — em breve */}
          <Pressable disabled style={[styles.quickActionButton, styles.disabled]}>
            <View style={styles.quickActionIcon}>
              <SvgIcon name="camera" size={22} color="#9ca3af" />
            </View>
            <Text style={styles.quickActionLabel}>Foto</Text>
            <Text style={styles.quickActionSoon}>Em breve</Text>
          </Pressable>

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
          </Pressable>
        </View>

      </View>
    </View>
  );
}
