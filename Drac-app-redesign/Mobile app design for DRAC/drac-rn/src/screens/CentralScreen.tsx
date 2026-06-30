/** CentralScreen — visão geral: status, alerta operacional e câmeras FAVORITAS. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraTile } from '../components/CameraTile';
import { FavoritesSheet } from '../components/FavoritesSheet';
import { Icon } from '../components/Icon';
import { mockCameras, mockUser, stats } from '../data/mock';
import { useLibrary } from '../state/LibraryProvider';
import { useTheme } from '../theme/ThemeProvider';
import type { Camera } from '../types';

const STAR_GOLD = '#fbbf24';

interface CentralScreenProps {
  showAlert?: boolean;
  onOpenCamera: (camera: Camera) => void;
}

export function CentralScreen({ showAlert = true, onOpenCamera }: CentralScreenProps) {
  const { theme } = useTheme();
  const { favorites, isFavorite, toggleFavorite } = useLibrary();
  const [sheetOpen, setSheetOpen] = useState(false);

  const favCameras = favorites.map((id) => mockCameras.find((c) => c.id === id)).filter(Boolean) as Camera[];
  const favGrid = favCameras.slice(0, 4);

  const StatCard = ({ label, value, color, glow }: { label: string; value: number; color: string; glow?: boolean }) => (
    <View style={[styles.stat, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.statTop}>
        <View style={[styles.statDot, { backgroundColor: color }, glow && { shadowColor: color, shadowOpacity: 0.6, shadowRadius: 4 }]} />
        <Text style={[styles.statLabel, { color: theme.textSub }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: theme.textSub }]}>Bom dia,</Text>
          <Text style={[styles.title, { color: theme.text }]}>Central</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Icon name="bell" size={20} color={theme.text} strokeWidth={1.8} />
            <View style={[styles.notifDot, { backgroundColor: theme.danger, borderColor: theme.surface }]} />
          </View>
          <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
            <Text style={styles.avatarText}>{mockUser.initials}</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Online" value={stats.online} color={theme.success} />
        <StatCard label="Offline" value={stats.offline} color={theme.danger} />
        <StatCard label="Gravando" value={stats.recording} color={theme.danger} glow />
      </View>

      {showAlert ? (
        <View style={[styles.alert, { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.28)' }]}>
          <View style={[styles.alertIcon, { backgroundColor: 'rgba(245,158,11,0.18)' }]}>
            <Icon name="alert" size={17} color={theme.warning} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: theme.text }]}>Atenção operacional</Text>
            <Text style={[styles.alertText, { color: theme.textSub }]}>2 câmeras offline na área Estoque. Verifique a conexão de rede.</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Icon name="star" size={16} color={STAR_GOLD} fill strokeWidth={1.6} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Favoritas</Text>
        </View>
        <Pressable style={styles.manageLink} onPress={() => setSheetOpen(true)}>
          <Icon name="plus" size={14} color={theme.accent} strokeWidth={2.2} />
          <Text style={[styles.sectionLink, { color: theme.accent }]}>Gerenciar</Text>
        </Pressable>
      </View>

      {favGrid.length > 0 ? (
        <View style={styles.grid}>
          {favGrid.map((cam) => (
            <View key={cam.id} style={styles.gridItem}>
              <CameraTile
                camera={cam}
                height={142}
                onPress={() => onOpenCamera(cam)}
                favorite={isFavorite(cam.id)}
                onToggleFavorite={() => toggleFavorite(cam.id)}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.surface }]}>
            <Icon name="star" size={24} color={STAR_GOLD} strokeWidth={1.7} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhuma câmera favorita</Text>
          <Text style={[styles.emptyText, { color: theme.textSub }]}>Toque na estrela de uma câmera para fixá-la aqui.</Text>
          <Pressable style={[styles.emptyBtn, { backgroundColor: theme.accent }]} onPress={() => setSheetOpen(true)}>
            <Text style={styles.emptyBtnText}>Escolher favoritas</Text>
          </Pressable>
        </View>
      )}

      <FavoritesSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 24, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 4 },
  greeting: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.5, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  statsRow: { flexDirection: 'row', gap: 11 },
  stat: { flex: 1, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 15, paddingHorizontal: 14 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDot: { width: 7, height: 7, borderRadius: 4 },
  statLabel: { fontSize: 11, fontWeight: '700' },
  statValue: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 6 },
  alert: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  alertIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 13.5, fontWeight: '700' },
  alertText: { fontSize: 12.5, fontWeight: '500', lineHeight: 18, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  manageLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionLink: { fontSize: 12.5, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  gridItem: { width: '47%', flexGrow: 1 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 20, paddingVertical: 30, paddingHorizontal: 22, alignItems: 'center', gap: 12 },
  emptyIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 14.5, fontWeight: '800' },
  emptyText: { fontSize: 12.5, fontWeight: '500', textAlign: 'center', marginTop: -6 },
  emptyBtn: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 20 },
  emptyBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
