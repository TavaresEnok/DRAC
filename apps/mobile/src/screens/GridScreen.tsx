import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SvgIcon } from '../components/SvgIcon';
import { styles } from '../styles/appStyles';
import type { Camera, MosaicArea } from '../types';
import { isOnline } from '../utils/format';

interface GridScreenProps {
  cameras: Camera[];
  groupedCameras: Array<[string, Camera[]]>;
  mosaicCameras: Camera[];
  mosaicAreas: MosaicArea[];
  streamPosters: Record<string, string | null>;
  selectedMosaicGroup: string;
  onSelectGroup: (groupName: string) => void;
  onCreateArea: (name: string) => void;
  onDeleteArea: (areaId: string) => void;
  onToggleCameraInArea: (areaId: string, cameraId: string) => void;
  onOpenCamera: (cameraId: string) => void;
}

export function GridScreen({
  cameras,
  mosaicCameras,
  mosaicAreas,
  streamPosters,
  selectedMosaicGroup,
  onSelectGroup,
  onCreateArea,
  onDeleteArea,
  onToggleCameraInArea,
  onOpenCamera,
}: GridScreenProps) {
  const [areaName, setAreaName] = useState('');
  const selectedArea = useMemo(
    () => mosaicAreas.find((area) => `area:${area.id}` === selectedMosaicGroup) ?? null,
    [mosaicAreas, selectedMosaicGroup],
  );
  const isAreaMode = Boolean(selectedArea);

  const createArea = () => {
    onCreateArea(areaName);
    setAreaName('');
  };

  return (
    <View style={styles.page}>
      <View style={styles.mosaicHeader}>
        <View>
          <Text style={styles.mosaicTitle}>Mosaico</Text>
          <Text style={styles.mosaicSubtitle}>Crie uma área e toque nas câmeras que devem aparecer nela.</Text>
        </View>
      </View>

      <View style={styles.areaCreatorCard}>
        <TextInput
          value={areaName}
          onChangeText={setAreaName}
          placeholder="Nova área: Quarto, Escritório..."
          placeholderTextColor="#64748b"
          style={styles.areaCreatorInput}
          returnKeyType="done"
          onSubmitEditing={createArea}
        />
        <Pressable onPress={createArea} style={styles.areaCreatorButton}>
          <SvgIcon name="plus" size={18} color="#ffffff" />
          <Text style={styles.areaCreatorButtonText}>Criar</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupFilterRow}>
        <Pressable
          onPress={() => onSelectGroup('all')}
          style={[styles.groupFilterChip, selectedMosaicGroup === 'all' && styles.groupFilterChipActive]}
        >
          <Text style={[styles.groupFilterText, selectedMosaicGroup === 'all' && styles.groupFilterTextActive]}>Todas</Text>
        </Pressable>
        {mosaicAreas.map((area) => (
          <Pressable
            key={area.id}
            onPress={() => onSelectGroup(`area:${area.id}`)}
            style={[styles.groupFilterChip, selectedMosaicGroup === `area:${area.id}` && styles.groupFilterChipActive]}
          >
            <Text style={[styles.groupFilterText, selectedMosaicGroup === `area:${area.id}` && styles.groupFilterTextActive]}>{area.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {selectedArea ? (
        <View style={styles.areaEditorCard}>
          <View style={styles.areaEditorHeader}>
            <View>
              <Text style={styles.areaEditorTitle}>{selectedArea.name}</Text>
              <Text style={styles.areaEditorSubtitle}>{selectedArea.cameraIds.length} câmeras nesta área</Text>
            </View>
            <Pressable onPress={() => onDeleteArea(selectedArea.id)} style={styles.areaDeleteButton}>
              <Text style={styles.areaDeleteText}>Excluir</Text>
            </Pressable>
          </View>
          <View style={styles.cameraSelectionGrid}>
            {cameras.map((camera) => {
              const added = selectedArea.cameraIds.includes(camera.id);
              return (
                <Pressable
                  key={camera.id}
                  onPress={() => onToggleCameraInArea(selectedArea.id, camera.id)}
                  style={[styles.cameraSelectionCard, added && styles.cameraSelectionCardActive]}
                >
                  <View style={styles.cameraSelectionThumb}>
                    {streamPosters[camera.id] ? (
                      <Image source={{ uri: streamPosters[camera.id] ?? undefined }} style={styles.cameraSelectionImage} />
                    ) : (
                      <SvgIcon name="camera" size={22} color="#94a3b8" />
                    )}
                    <View style={[styles.cameraSelectionCheck, added && styles.cameraSelectionCheckActive]}>
                      <Text style={[styles.cameraSelectionCheckText, added && styles.cameraSelectionCheckTextActive]}>{added ? 'OK' : '+'}</Text>
                    </View>
                  </View>
                  <Text style={styles.cameraSelectionName} numberOfLines={1}>{camera.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.mosaicSectionHeader}>
        <Text style={styles.mosaicSectionTitle}>{isAreaMode ? `Mosaico: ${selectedArea?.name}` : 'Todas as câmeras'}</Text>
        <Text style={styles.mosaicSectionCount}>{mosaicCameras.length} câmeras</Text>
      </View>
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
      {selectedArea && !mosaicCameras.length ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Escolha as câmeras</Text>
          <Text style={styles.emptyText}>Toque nas câmeras acima. As escolhidas aparecem aqui no mosaico.</Text>
        </View>
      ) : null}
    </View>
  );
}
