import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { styles } from '../styles/appStyles';
import type { Camera } from '../types';
import { isOnline } from '../utils/format';

interface GridScreenProps {
  groupedCameras: Array<[string, Camera[]]>;
  mosaicCameras: Camera[];
  streamPosters: Record<string, string | null>;
  selectedMosaicGroup: string;
  onSelectGroup: (groupName: string) => void;
  onOpenCamera: (cameraId: string) => void;
}

export function GridScreen({
  groupedCameras,
  mosaicCameras,
  streamPosters,
  selectedMosaicGroup,
  onSelectGroup,
  onOpenCamera,
}: GridScreenProps) {
  return (
    <View style={styles.page}>
      <View style={styles.mosaicHeader}>
        <Text style={styles.mosaicTitle}>Mosaico</Text>
        <Pressable disabled style={[styles.editLayoutButton, styles.disabled]}>
          <Text style={styles.editLayoutText}>Editar Layout</Text>
          <Text style={styles.editLayoutSoon}>Em breve</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupFilterRow}>
        {['Todas', ...groupedCameras.map(([groupName]) => groupName)].map((groupName) => (
          <Pressable
            key={groupName}
            onPress={() => onSelectGroup(groupName)}
            style={[styles.groupFilterChip, selectedMosaicGroup === groupName && styles.groupFilterChipActive]}
          >
            <Text style={[styles.groupFilterText, selectedMosaicGroup === groupName && styles.groupFilterTextActive]}>{groupName}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.mosaicGrid}>
        {mosaicCameras.map((camera) => (
          <Pressable
            key={camera.id}
            onPress={() => onOpenCamera(camera.id)}
            style={styles.mosaicTile}
          >
            {streamPosters[camera.id] ? (
              <Image source={{ uri: streamPosters[camera.id] ?? undefined }} style={styles.mosaicImage} />
            ) : (
              <View style={styles.mosaicFallback}><Text style={styles.mosaicFallbackText}>DRAC</Text></View>
            )}
            <View style={styles.mosaicShade} />
            <View style={[styles.mosaicStatus, isOnline(camera) ? styles.mosaicStatusOnline : styles.mosaicStatusOffline]} />
            <View style={styles.mosaicFooter}><Text style={styles.mosaicCameraName}>{camera.name}</Text></View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
