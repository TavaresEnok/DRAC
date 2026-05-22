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
          <Text style={styles.emptyText}>Volte em Câmeras e toque em uma câmera para abrir o ao vivo.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.cameraStage}>
        <View style={styles.cameraDetailHeader}>
          <Pressable onPress={onBack} style={styles.headerIconButton}>
            <SvgIcon name="chevronLeft" size={28} color="#cbd5e1" />
          </Pressable>
          <View>
            <Text style={styles.cameraDetailTitle}>{selectedCamera.name}</Text>
            <Text style={styles.cameraDetailSubtitle}>{isOnline(selectedCamera) ? 'Conectado' : 'Offline'}</Text>
          </View>
          <View style={[styles.headerIconButton, styles.disabled]}>
            <SvgIcon name="settings" size={23} color="#64748b" />
          </View>
        </View>

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
          <View style={styles.singleVideoTopOverlay}>
            <Text style={styles.liveNowText}>AO VIVO</Text>
            <Text style={styles.videoProtocol}>HLS</Text>
          </View>
        </View>

        <View style={styles.quickActionsGrid}>
          <Pressable disabled style={[styles.quickActionButton, styles.disabled]}>
            <View style={styles.quickActionIcon}><SvgIcon name="mic" color="#cbd5e1" /></View>
            <Text style={styles.quickActionLabel}>Falar</Text>
            <Text style={styles.quickActionSoon}>Em breve</Text>
          </Pressable>
          <Pressable disabled style={[styles.quickActionButton, styles.disabled]}>
            <View style={styles.quickActionIcon}><SvgIcon name="camera" color="#cbd5e1" /></View>
            <Text style={styles.quickActionLabel}>Foto</Text>
            <Text style={styles.quickActionSoon}>Em breve</Text>
          </Pressable>
          <Pressable disabled={!selectedCamera.canRecord} onPress={() => onStartRecording(selectedCamera)} style={[styles.quickActionButton, !selectedCamera.canRecord && styles.disabled]}>
            <View style={styles.quickActionIcon}><SvgIcon name="video" color="#cbd5e1" /></View>
            <Text style={styles.quickActionLabel}>Gravar</Text>
          </Pressable>
          <Pressable disabled={!selectedCamera.canControl} onPress={onTogglePtz} style={[styles.quickActionButton, !selectedCamera.canControl && styles.disabled]}>
            <View style={[styles.quickActionIcon, showPtz && styles.quickActionIconActive]}><SvgIcon name="move" color={showPtz ? '#020617' : '#cbd5e1'} /></View>
            <Text style={styles.quickActionLabel}>PTZ</Text>
          </Pressable>
        </View>

        {showPtz ? (
          <View style={styles.ptzCardPremium}>
            {ptzFeedback ? <Text style={styles.ptzFeedback}>Enviado: {ptzFeedback}</Text> : null}
            <View style={styles.ptzConsole}>
              <View style={styles.ptzDpad}>
                <PtzButton label="⌃" direction="Up" disabled={!selectedCamera.canControl} active={ptzActive === 'Up'} onPress={onSendPtz} style={styles.ptzUp} buttonStyle={styles.ptzRoundButton} activeButtonStyle={styles.ptzRoundButtonActive} disabledStyle={styles.disabled} textStyle={styles.ptzRoundText} activeTextStyle={styles.ptzRoundTextActive} />
                <PtzButton label="⌄" direction="Down" disabled={!selectedCamera.canControl} active={ptzActive === 'Down'} onPress={onSendPtz} style={styles.ptzDown} buttonStyle={styles.ptzRoundButton} activeButtonStyle={styles.ptzRoundButtonActive} disabledStyle={styles.disabled} textStyle={styles.ptzRoundText} activeTextStyle={styles.ptzRoundTextActive} />
                <PtzButton label="‹" direction="Left" disabled={!selectedCamera.canControl} active={ptzActive === 'Left'} onPress={onSendPtz} style={styles.ptzLeft} buttonStyle={styles.ptzRoundButton} activeButtonStyle={styles.ptzRoundButtonActive} disabledStyle={styles.disabled} textStyle={styles.ptzRoundText} activeTextStyle={styles.ptzRoundTextActive} />
                <PtzButton label="›" direction="Right" disabled={!selectedCamera.canControl} active={ptzActive === 'Right'} onPress={onSendPtz} style={styles.ptzRight} buttonStyle={styles.ptzRoundButton} activeButtonStyle={styles.ptzRoundButtonActive} disabledStyle={styles.disabled} textStyle={styles.ptzRoundText} activeTextStyle={styles.ptzRoundTextActive} />
                <View style={styles.ptzNub}><View style={styles.ptzNubInner} /></View>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
