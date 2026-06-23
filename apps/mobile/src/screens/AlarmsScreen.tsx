import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SvgIcon } from '../components/SvgIcon';
import { styles } from '../styles/appStyles';
import type { Alarm } from '../types';

interface AlarmsScreenProps {
  alarms: Alarm[];
  canManage: boolean;
  onAck: (alarm: Alarm) => void;
  onResolve: (alarm: Alarm) => void;
  onOpenCamera: (cameraId: string) => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  P1: '#dc2626',
  P2: '#ea580c',
  P3: '#d97706',
  P4: '#2563eb',
};

function priorityColor(priority: string): string {
  return PRIORITY_COLOR[priority] ?? '#6b7280';
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'agora há pouco';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

export function AlarmsScreen({ alarms, canManage, onAck, onResolve, onOpenCamera }: AlarmsScreenProps) {
  const { active, resolved } = useMemo(() => {
    const isResolved = (alarm: Alarm) => alarm.status === 'RESOLVED';
    return {
      active: alarms.filter((alarm) => !isResolved(alarm)),
      resolved: alarms.filter(isResolved).slice(0, 20),
    };
  }, [alarms]);

  const openCount = active.filter((alarm) => alarm.status === 'OPEN').length;

  return (
    <View style={styles.page}>
      <View style={styles.mosaicHeader}>
        <View>
          <Text style={styles.mosaicTitle}>Alarmes</Text>
          <Text style={styles.mosaicSubtitle}>
            {openCount > 0 ? `${openCount} alarme(s) aguardando atenção` : 'Nenhum alarme em aberto.'}
          </Text>
        </View>
        <View style={[styles.alarmCountPill, openCount > 0 ? styles.alarmCountPillActive : null]}>
          <Text style={[styles.alarmCountText, openCount > 0 ? styles.alarmCountTextActive : null]}>{active.length}</Text>
        </View>
      </View>

      {active.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Tudo tranquilo</Text>
          <Text style={styles.emptyText}>Quando uma câmera disparar um alarme, ele aparece aqui para você reconhecer ou resolver.</Text>
        </View>
      ) : null}

      {active.map((alarm) => {
        const acked = alarm.status === 'ACKED';
        return (
          <View key={alarm.id} style={styles.alarmCard}>
            <View style={[styles.alarmPriorityBar, { backgroundColor: priorityColor(alarm.priority) }]} />
            <View style={styles.alarmBody}>
              <View style={styles.alarmTopRow}>
                <View style={[styles.alarmPriorityTag, { backgroundColor: priorityColor(alarm.priority) }]}>
                  <Text style={styles.alarmPriorityTagText}>{alarm.priority || '—'}</Text>
                </View>
                <Text style={styles.alarmType} numberOfLines={1}>{alarm.title || alarm.type.replace(/_/g, ' ')}</Text>
                {acked ? <Text style={styles.alarmAckedBadge}>RECONHECIDO</Text> : null}
                {alarm.isSnoozed ? <Text style={styles.alarmSnoozedBadge}>SILENCIADO</Text> : null}
              </View>

              {alarm.message ? <Text style={styles.alarmMessage} numberOfLines={3}>{alarm.message}</Text> : null}

              <View style={styles.alarmMetaRow}>
                <SvgIcon name="camera" size={13} color="#9ca3af" />
                <Text style={styles.alarmMetaText} numberOfLines={1}>{alarm.cameraName ?? 'Câmera removida'}</Text>
                <Text style={styles.alarmMetaDot}>•</Text>
                <Text style={styles.alarmMetaText}>{timeAgo(alarm.occurredAt)}</Text>
                {alarm.occurrenceCount && alarm.occurrenceCount > 1 ? (
                  <>
                    <Text style={styles.alarmMetaDot}>•</Text>
                    <Text style={styles.alarmMetaText}>{alarm.occurrenceCount}×</Text>
                  </>
                ) : null}
              </View>

              <View style={styles.alarmActionsRow}>
                {alarm.cameraId ? (
                  <Pressable onPress={() => onOpenCamera(alarm.cameraId as string)} style={[styles.alarmActionButton, styles.alarmActionGhost]}>
                    <SvgIcon name="video" size={15} color="#2563eb" />
                    <Text style={styles.alarmActionGhostText}>Ver ao vivo</Text>
                  </Pressable>
                ) : null}
                {canManage && !acked ? (
                  <Pressable onPress={() => onAck(alarm)} style={[styles.alarmActionButton, styles.alarmActionAck]}>
                    <Text style={styles.alarmActionAckText}>Reconhecer</Text>
                  </Pressable>
                ) : null}
                {canManage ? (
                  <Pressable onPress={() => onResolve(alarm)} style={[styles.alarmActionButton, styles.alarmActionResolve]}>
                    <Text style={styles.alarmActionResolveText}>Resolver</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}

      {resolved.length > 0 ? (
        <>
          <View style={styles.mosaicSectionHeader}>
            <Text style={styles.mosaicSectionTitle}>Resolvidos recentemente</Text>
            <Text style={styles.mosaicSectionCount}>{resolved.length}</Text>
          </View>
          {resolved.map((alarm) => (
            <View key={alarm.id} style={[styles.alarmCard, styles.alarmCardResolved]}>
              <View style={[styles.alarmPriorityBar, { backgroundColor: '#9ca3af' }]} />
              <View style={styles.alarmBody}>
                <Text style={styles.alarmType} numberOfLines={1}>{alarm.title || alarm.type.replace(/_/g, ' ')}</Text>
                <View style={styles.alarmMetaRow}>
                  <Text style={styles.alarmMetaText} numberOfLines={1}>{alarm.cameraName ?? 'Câmera'}</Text>
                  <Text style={styles.alarmMetaDot}>•</Text>
                  <Text style={styles.alarmMetaText}>{timeAgo(alarm.occurredAt)}</Text>
                </View>
              </View>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
