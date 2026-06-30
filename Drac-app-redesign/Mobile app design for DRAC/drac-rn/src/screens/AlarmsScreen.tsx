/** AlarmsScreen — eventos de alarme com gravidade, reconhecer/resolver. */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { mockAlarms } from '../data/mock';
import { useTheme } from '../theme/ThemeProvider';
import type { AlarmEvent } from '../types';

const SEGMENTS = ['Abertos', 'Reconhecidos', 'Todos'];

export function AlarmsScreen() {
  const { theme } = useTheme();
  const [segment, setSegment] = useState('Abertos');

  const open = mockAlarms.filter((a) => a.severity !== 'resolved');

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Alarmes</Text>
          <Text style={[styles.subtitle, { color: theme.textSub }]}>{open.length} eventos em aberto</Text>
        </View>
      </View>

      {/* Segmented control */}
      <View style={[styles.segments, { backgroundColor: theme.surfaceAlt }]}>
        {SEGMENTS.map((s) => {
          const on = s === segment;
          return (
            <Text
              key={s}
              onPress={() => setSegment(s)}
              style={[
                styles.segment,
                on && { backgroundColor: theme.surface },
                { color: on ? theme.text : theme.textSub },
              ]}
            >
              {s}
            </Text>
          );
        })}
      </View>

      <View style={{ gap: 11 }}>
        {mockAlarms.map((alarm) => (
          <AlarmCard key={alarm.id} alarm={alarm} />
        ))}
      </View>
    </ScrollView>
  );
}

function AlarmCard({ alarm }: { alarm: AlarmEvent }) {
  const { theme } = useTheme();

  if (alarm.severity === 'resolved') {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, opacity: 0.62 }]}>
        <View style={styles.cardBody}>
          <View style={[styles.resolvedIcon, { backgroundColor: 'rgba(34,197,94,0.14)' }]}>
            <Icon name="check" size={20} color={theme.success} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.cardTopRow}>
              <Text style={[styles.cardType, { color: theme.text, fontSize: 13.5 }]}>{alarm.type}</Text>
              <Text style={[styles.cardAgo, { color: theme.textMuted }]}>{alarm.ago}</Text>
            </View>
            <Text style={[styles.cardLoc, { color: theme.textSub }]}>{alarm.cameraName} · Resolvido por {alarm.resolvedBy}</Text>
          </View>
        </View>
      </View>
    );
  }

  const stripe = alarm.severity === 'high' ? theme.danger : theme.warning;
  const borderColor = alarm.severity === 'high' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.28)';

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor }]}>
      <View style={[styles.stripe, { backgroundColor: stripe }]} />
      <View style={styles.cardInner}>
        <View style={styles.cardBody}>
          <LinearGradient colors={['#1f2937', '#0f172a']} style={styles.thumb}>
            <View style={[styles.thumbDot, { backgroundColor: stripe }]} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <View style={styles.cardTopRow}>
              <Text style={[styles.cardType, { color: theme.text }]}>{alarm.type}</Text>
              <Text style={[styles.cardAgo, { color: theme.textMuted }]}>{alarm.ago}</Text>
            </View>
            <Text style={[styles.cardLoc, { color: theme.textSub }]}>{alarm.cameraName} · {alarm.location}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Text style={[styles.actionGhost, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}>Reconhecer</Text>
          <View style={styles.actionPrimaryWrap}>
            <LinearGradient colors={[theme.accent, theme.accentDark]} style={styles.actionPrimary}>
              <Text style={styles.actionPrimaryText}>Resolver</Text>
            </LinearGradient>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 24, gap: 16 },
  header: { marginTop: 10 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  segments: { flexDirection: 'row', borderRadius: 13, padding: 4, gap: 7 },
  segment: { flex: 1, textAlign: 'center', paddingVertical: 9, borderRadius: 10, fontSize: 12.5, fontWeight: '700', overflow: 'hidden' },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  stripe: { height: 3 },
  cardInner: { padding: 14 },
  cardBody: { flexDirection: 'row', gap: 12, padding: 0, alignItems: 'center' },
  thumb: { width: 54, height: 54, borderRadius: 12, position: 'relative' },
  thumbDot: { position: 'absolute', top: 6, left: 6, width: 6, height: 6, borderRadius: 3 },
  resolvedIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', margin: 14, marginRight: 0 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardType: { fontSize: 14, fontWeight: '800' },
  cardAgo: { fontSize: 11, fontWeight: '600' },
  cardLoc: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionGhost: { flex: 1, textAlign: 'center', paddingVertical: 9, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  actionPrimaryWrap: { flex: 1, borderRadius: 11, overflow: 'hidden' },
  actionPrimary: { paddingVertical: 9, alignItems: 'center' },
  actionPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
