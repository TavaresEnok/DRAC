/** MosaicScreen — grade de câmeras organizada por GRUPOS (criáveis pelo usuário). */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraTile } from '../components/CameraTile';
import { GroupEditorSheet } from '../components/GroupEditorSheet';
import { Icon } from '../components/Icon';
import { mockCameras } from '../data/mock';
import { useLibrary } from '../state/LibraryProvider';
import { useTheme } from '../theme/ThemeProvider';
import type { Camera, CameraGroup } from '../types';

interface MosaicScreenProps {
  onOpenCamera: (camera: Camera) => void;
}

export function MosaicScreen({ onOpenCamera }: MosaicScreenProps) {
  const { theme } = useTheme();
  const { groups, isFavorite, toggleFavorite } = useLibrary();

  const [selected, setSelected] = useState<string>('all'); // 'all' | groupId
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CameraGroup | null>(null);

  const activeGroup = groups.find((g) => g.id === selected) || null;
  const cameras = useMemo(
    () => (selected === 'all' ? mockCameras : mockCameras.filter((c) => activeGroup?.cameraIds.includes(c.id))),
    [selected, activeGroup],
  );

  const openNew = () => { setEditingGroup(null); setEditorOpen(true); };
  const openEdit = () => { if (activeGroup) { setEditingGroup(activeGroup); setEditorOpen(true); } };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Mosaico</Text>
        <Pressable style={[styles.newBtn, { backgroundColor: theme.accent }]} onPress={openNew}>
          <Icon name="plus" size={16} color="#fff" strokeWidth={2.4} />
          <Text style={styles.newBtnText}>Grupo</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {[{ id: 'all', name: 'Todas' }, ...groups].map((g) => {
          const on = g.id === selected;
          return (
            <Text
              key={g.id}
              onPress={() => setSelected(g.id)}
              style={[styles.chip, { backgroundColor: on ? theme.accent : theme.surface, borderColor: on ? theme.accent : theme.border, color: on ? '#fff' : theme.textSub }]}
            >
              {g.name}
            </Text>
          );
        })}
        <Pressable style={[styles.chipNew, { borderColor: theme.border }]} onPress={openNew}>
          <Icon name="plus" size={13} color={theme.accent} strokeWidth={2.6} />
          <Text style={[styles.chipNewText, { color: theme.accent }]}>Novo</Text>
        </Pressable>
      </ScrollView>

      {activeGroup ? (
        <View style={styles.groupBar}>
          <Text style={[styles.groupCount, { color: theme.textSub }]}>
            {activeGroup.cameraIds.length} câmera{activeGroup.cameraIds.length === 1 ? '' : 's'} neste grupo
          </Text>
          <Pressable style={styles.editLink} onPress={openEdit}>
            <Icon name="edit" size={13} color={theme.accent} strokeWidth={2} />
            <Text style={[styles.editLinkText, { color: theme.accent }]}>Editar grupo</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.grid}>
        {cameras.map((cam) => (
          <View key={cam.id} style={styles.gridItem}>
            <CameraTile
              camera={cam}
              height={138}
              onPress={() => onOpenCamera(cam)}
              favorite={isFavorite(cam.id)}
              onToggleFavorite={() => toggleFavorite(cam.id)}
            />
          </View>
        ))}
      </View>

      <GroupEditorSheet visible={editorOpen} group={editingGroup} onClose={() => setEditorOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 16 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.5 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 13 },
  newBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  chips: { gap: 8, paddingBottom: 14, alignItems: 'center' },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, fontSize: 12.5, fontWeight: '700', overflow: 'hidden' },
  chipNew: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 15, borderRadius: 11, borderWidth: 1, borderStyle: 'dashed' },
  chipNewText: { fontSize: 12.5, fontWeight: '700' },
  groupBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, paddingHorizontal: 2 },
  groupCount: { fontSize: 12, fontWeight: '600' },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  editLinkText: { fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5.5 },
  gridItem: { width: '50%', paddingHorizontal: 5.5, marginBottom: 11 },
});
