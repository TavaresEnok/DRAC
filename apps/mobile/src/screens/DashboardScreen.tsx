import { Image, Pressable, Text, View } from 'react-native';
import { SvgIcon } from '../components/SvgIcon';
import { styles } from '../styles/appStyles';
import { C } from '../styles/colors';
import type { Camera } from '../types';
import { formatResolution, isOnline } from '../utils/format';

interface DashboardScreenProps {
  cameras: Camera[];
  groupedCameras: Array<[string, Camera[]]>;
  streamPosters: Record<string, string | null>;
  previewLimit: number;
  operationalMessages: string[];
  onOpenCamera: (cameraId: string) => void;
}

export function DashboardScreen({ cameras, groupedCameras, streamPosters, previewLimit, operationalMessages, onOpenCamera }: DashboardScreenProps) {
  const onlineCount  = cameras.filter(isOnline).length;
  const offlineCount = cameras.length - onlineCount;

  return (
    <View style={styles.page}>
      <View style={styles.dashboardHeader}>
        <View>
          <Text style={styles.dashboardTitle}>Câmeras</Text>
          <Text style={styles.dashboardSubtitle}>Acesso filtrado pelo seu grupo</Text>
          {/* Online / offline counters */}
          <View style={styles.dashboardStatRow}>
            <View style={styles.dashboardStat}>
              <View style={[styles.dashboardStatDot, { backgroundColor: C.success }]} />
              <Text style={styles.dashboardStatText}>{onlineCount} online</Text>
            </View>
            <View style={styles.dashboardStat}>
              <View style={[styles.dashboardStatDot, { backgroundColor: C.danger }]} />
              <Text style={styles.dashboardStatText}>{offlineCount} offline</Text>
            </View>
          </View>
          {cameras.length > previewLimit ? (
            <Text style={styles.previewLimitHint}>
              Pré-visualização carregada para as primeiras {previewLimit} câmeras.
            </Text>
          ) : null}
        </View>
      </View>

      {operationalMessages.length ? (
        <View style={styles.mobileAlertsCard}>
          <View style={styles.mobileAlertsHeader}>
            <SvgIcon name="bell" size={17} color="#b45309" />
            <Text style={styles.mobileAlertsTitle}>Atenção operacional</Text>
          </View>
          {operationalMessages.map((message) => (
            <Text key={message} style={styles.mobileAlertsText}>{message}</Text>
          ))}
        </View>
      ) : null}

      {groupedCameras.map(([groupName, items]) => (
        <View key={groupName} style={styles.groupBlock}>
          <View style={styles.groupHeader}>
            <Text style={styles.groupTitle}>{groupName}</Text>
            <Text style={styles.groupCount}>{items.length} câmeras</Text>
          </View>
          {items.map((camera) => (
            <Pressable
              key={camera.id}
              onPress={() => onOpenCamera(camera.id)}
              style={styles.cameraCard}
            >
              <View style={styles.cameraPreview}>
                {streamPosters[camera.id] ? (
                  <Image source={{ uri: streamPosters[camera.id] ?? undefined }} style={styles.cameraPreviewImage} />
                ) : (
                  <View style={styles.cameraPreviewFallback}>
                    <Text style={styles.cameraPreviewText}>DRAC</Text>
                  </View>
                )}
                <View style={styles.cameraPreviewShade} />
                <View style={[styles.liveBadge, isOnline(camera) ? styles.liveBadgeOnline : styles.liveBadgeOffline]}>
                  <View style={[styles.liveDot, isOnline(camera) ? styles.liveDotOnline : styles.liveDotOffline]} />
                  <Text style={[styles.liveBadgeText, isOnline(camera) ? styles.liveBadgeTextOnline : styles.liveBadgeTextOffline]}>
                    {isOnline(camera) ? 'ONLINE' : 'OFF'}
                  </Text>
                </View>
                <View style={styles.cameraOverlayBody}>
                  <View style={styles.cameraCardTop}>
                    <View style={styles.cameraOverlayTextBlock}>
                      <Text style={styles.cameraName}>{camera.name}</Text>
                      <Text style={styles.cameraMeta}>{formatResolution(camera)}</Text>
                    </View>
                    <View style={styles.cardPlayButton}><SvgIcon name="play" size={18} color="#ffffff" /></View>
                  </View>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}
