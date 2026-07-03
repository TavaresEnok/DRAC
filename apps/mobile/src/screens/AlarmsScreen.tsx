/** AlarmsScreen — eventos de detecção de movimento: reconhecer/resolver. */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../services/branding';
import type { Alarm } from '../types';

const SEGMENTS = ['Abertos', 'Reconhecidos', 'Todos'] as const;
type Segment = (typeof SEGMENTS)[number];

interface AlarmsScreenProps {
  alarms: Alarm[];
  canManage: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onAck: (alarm: Alarm) => void;
  onResolve: (alarm: Alarm) => void;
  onOpenCamera: (cameraId: string) => void;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}


export function AlarmsScreen({ alarms, canManage, refreshing, onRefresh, onAck, onResolve, onOpenCamera }: AlarmsScreenProps) {
  const { theme } = useTheme();
  const [segment, setSegment] = useState<Segment>('Abertos');

  const openCount = useMemo(() => alarms.filter((a) => a.status === 'OPEN').length, [alarms]);
  const filtered = useMemo(() => {
    if (segment === 'Abertos') return alarms.filter((a) => a.status === 'OPEN');
    if (segment === 'Reconhecidos') return alarms.filter((a) => a.status === 'ACKED');
    return alarms;
  }, [alarms, segment]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSub} />}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={[styles.headerIcon, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
            <Icon name="eye" size={22} color="#ef4444" strokeWidth={2} />
          </View>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Alarmes</Text>
            <Text style={[styles.subtitle, { color: theme.textSub }]}>
              Detecção de movimento · {openCount} em aberto
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.segments, { backgroundColor: theme.surfaceAlt }]}>
        {SEGMENTS.map((s) => {
          const on = s === segment;
          return (
            <Text
              key={s}
              onPress={() => setSegment(s)}
              style={[styles.segment, on && { backgroundColor: theme.surface }, { color: on ? theme.text : theme.textSub }]}
            >
              {s}
            </Text>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.surface }]}>
            <Icon name="check" size={24} color={theme.success} strokeWidth={2.2} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Tudo tranquilo</Text>
          <Text style={[styles.emptyText, { color: theme.textSub }]}>Nenhum alarme nesta categoria.</Text>
        </View>
      ) : (
        <View style={{ gap: 11 }}>
          {filtered.map((alarm) => (
            <AlarmCard
              key={alarm.id}
              alarm={alarm}
              canManage={canManage}
              onAck={() => onAck(alarm)}
              onResolve={() => onResolve(alarm)}
              onOpen={() => alarm.cameraId && onOpenCamera(alarm.cameraId)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function AlarmCard({
  alarm, canManage, onAck, onResolve, onOpen,
}: { alarm: Alarm; canManage: boolean; onAck: () => void; onResolve: () => void; onOpen: () => void }) {
  const { theme } = useTheme();
  const ago = timeAgo(alarm.occurredAt);
  const label = alarm.title || alarm.type;
  const sub = alarm.cameraName || alarm.message || '—';

  const acked = alarm.status === 'ACKED';

  if (alarm.status === 'RESOLVED') {
    return (
      <Pressable onPress={onOpen} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, opacity: 0.62 }]}>
        <View style={styles.cardBody}>
          <View style={[styles.motionIcon, { backgroundColor: 'rgba(34,197,94,0.14)' }]}>
            <Icon name="check" size={18} color={theme.success} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.cardTopRow}>
              <Text style={[styles.cardType, { color: theme.text }]} numberOfLines={1}>
                {label || 'Detecção de Movimento'}
              </Text>
              <Text style={[styles.cardAgo, { color: theme.textMuted }]}>{ago}</Text>
            </View>
            <Text style={[styles.cardLoc, { color: theme.textSub }]} numberOfLines={1}>
              {sub}{alarm.acknowledgedByUserName ? ` · ${alarm.acknowledgedByUserName}` : ''}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  // Reconhecido segue a cor principal da marca; aberto é vermelho (semântico).
  const borderColor = acked ? (withAlpha(theme.accent, 0.28) ?? theme.border) : 'rgba(239,68,68,0.28)';
  const accentColor = acked ? theme.accent : '#ef4444';
  const iconBg = acked ? (withAlpha(theme.accent, 0.14) ?? theme.accentBg) : 'rgba(239,68,68,0.12)';

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor }]}>
      <View style={[styles.stripe, { backgroundColor: accentColor }]} />
      <View style={styles.cardInner}>
        <Pressable style={styles.cardBody} onPress={onOpen}>
          <View style={[styles.motionIcon, { backgroundColor: iconBg }]}>
            <Icon name="eye" size={20} color={accentColor} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.cardTopRow}>
              <Text style={[styles.cardType, { color: theme.text }]} numberOfLines={1}>
                {label || 'Detecção de Movimento'}
              </Text>
              <Text style={[styles.cardAgo, { color: theme.textMuted }]}>{ago}</Text>
            </View>
            <Text style={[styles.cardLoc, { color: theme.textSub }]} numberOfLines={1}>
              {sub}{acked ? ' · Reconhecido' : ''}
            </Text>
          </View>
          {alarm.cameraId ? (
            <View style={[styles.openCamBtn, { borderColor: theme.border }]}>
              <Icon name="camera" size={15} color={theme.textSub} strokeWidth={1.8} />
            </View>
          ) : null}
        </Pressable>
        {canManage ? (
          <View style={styles.actions}>
            {!acked ? (
              <Text onPress={onAck} style={[styles.actionGhost, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}>Reconhecer</Text>
            ) : null}
            <Pressable style={styles.actionPrimaryWrap} onPress={onResolve}>
              <LinearGradient colors={[theme.accent, theme.accentDark]} style={styles.actionPrimary}>
                <Text style={styles.actionPrimaryText}>Resolver</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 24, gap: 16 },
  header: { marginTop: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  segments: { flexDirection: 'row', borderRadius: 13, padding: 4, gap: 7 },
  segment: { flex: 1, textAlign: 'center', paddingVertical: 9, borderRadius: 10, fontSize: 12.5, fontWeight: '700', overflow: 'hidden' },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  stripe: { height: 3 },
  cardInner: { padding: 14 },
  cardBody: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  motionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  openCamBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardType: { fontSize: 13.5, fontWeight: '800', flex: 1 },
  cardAgo: { fontSize: 11, fontWeight: '600' },
  cardLoc: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionGhost: { flex: 1, textAlign: 'center', paddingVertical: 9, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  actionPrimaryWrap: { flex: 1, borderRadius: 11, overflow: 'hidden' },
  actionPrimary: { paddingVertical: 9, alignItems: 'center' },
  actionPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 20, paddingVertical: 36, paddingHorizontal: 22, alignItems: 'center', gap: 10 },
  emptyIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 14.5, fontWeight: '800' },
  emptyText: { fontSize: 12.5, fontWeight: '500', textAlign: 'center' },
});
