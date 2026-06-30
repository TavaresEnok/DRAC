/**
 * FavoritesSheet — modal "Gerenciar favoritas": lista todas as câmeras com estrela.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLibrary } from '../state/LibraryProvider';
import { useTheme } from '../theme/ThemeProvider';
import type { Camera } from '../types';
import { areaLabel, tintFor } from '../utils/camera-view';
import { Icon } from './Icon';

const STAR_GOLD = '#fbbf24';

export function FavoritesSheet({ visible, cameras, onClose }: { visible: boolean; cameras: Camera[]; onClose: () => void }) {
  const { theme } = useTheme();
  const { isFavorite, toggleFavorite } = useLibrary();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.bg, borderColor: theme.border }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              <Icon name="star" size={18} color={STAR_GOLD} fill strokeWidth={1.6} />
              <Text style={[styles.title, { color: theme.text }]}>Favoritas</Text>
            </View>
            <Pressable style={[styles.closeBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onClose}>
              <Icon name="close" size={16} color={theme.textSub} strokeWidth={2.2} />
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: theme.textSub }]}>Toque na estrela para fixar a câmera na Central.</Text>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
            {cameras.map((cam) => {
              const fav = isFavorite(cam.id);
              return (
                <View key={cam.id} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <LinearGradient colors={tintFor(cam)} style={styles.thumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{cam.name}</Text>
                    <Text style={[styles.area, { color: theme.textSub }]} numberOfLines={1}>{areaLabel(cam)}</Text>
                  </View>
                  <Pressable
                    style={[styles.starBtn, { backgroundColor: fav ? 'rgba(251,191,36,0.14)' : theme.surfaceAlt, borderColor: fav ? 'rgba(251,191,36,0.4)' : theme.border }]}
                    onPress={() => toggleFavorite(cam.id)}
                  >
                    <Icon name="star" size={18} color={fav ? STAR_GOLD : theme.textMuted} fill={fav} strokeWidth={1.7} />
                  </Pressable>
                </View>
              );
            })}
            {cameras.length === 0 ? (
              <Text style={[styles.hint, { color: theme.textMuted, textAlign: 'center', marginTop: 12 }]}>Nenhuma câmera disponível.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 34 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 6, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12.5, fontWeight: '500', marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  thumb: { width: 42, height: 42, borderRadius: 11 },
  name: { fontSize: 13.5, fontWeight: '700' },
  area: { fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  starBtn: { width: 38, height: 38, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
