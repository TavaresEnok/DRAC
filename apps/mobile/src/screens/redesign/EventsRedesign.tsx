/**
 * Eventos (redesign) — réplica da tela "Atividade" do mockup: título, chips
 * Todos/Movimento/Sistema, agrupado por dia (HOJE/ONTEM), linhas com miniatura + ponto de
 * tipo + título + câmera·hora + hora mono. Ligada aos alarmes reais.
 */
import { useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../components/Icon';
import type { Alarm, Camera } from '../../types';

const TITLE = 'Sora';
const UI = 'InstrumentSans';
const MONO = 'JetBrainsMono';

interface Props {
  alarms: Alarm[];
  cameras: Camera[];
  streamPosters: Record<string, string | null>;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenCamera: (cameraId: string) => void;
}

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'motion', label: 'Movimento' },
  { id: 'system', label: 'Sistema' },
] as const;

const SYSTEM_TYPES = new Set(['offline', 'online', 'system', 'disk', 'recording']);

function labelForEvent(type: string): string {
  const map: Record<string, string> = {
    motion: 'Movimento detectado', person: 'Pessoa detectada', face: 'Rosto detectado',
    offline: 'Câmera offline', online: 'Câmera online', disk: 'Alerta de armazenamento',
  };
  return map[type] ?? 'Evento detectado';
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'HOJE';
  if (same(d, yest)) return 'ONTEM';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }).toUpperCase();
}

export function EventsRedesign({ alarms, cameras, streamPosters, refreshing, onRefresh, onOpenCamera }: Props) {
  const { theme } = useTheme();
  const [filter, setFilter] = useState<'all' | 'motion' | 'system'>('all');
  const s = makeStyles(theme);

  const groups = useMemo(() => {
    const list = alarms.filter((a) => {
      if (filter === 'all') return true;
      const sys = SYSTEM_TYPES.has(a.type);
      return filter === 'system' ? sys : !sys;
    });
    const byDay = new Map<string, Alarm[]>();
    for (const a of list) {
      const key = dayLabel(a.occurredAt);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(a);
    }
    return Array.from(byDay.entries());
  }, [alarms, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        contentContainerStyle={s.root}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        <Text style={s.title}>Atividade</Text>

        <View style={s.chips}>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <TouchableOpacity key={f.id} style={[s.chip, on && s.chipOn]} onPress={() => setFilter(f.id)} activeOpacity={0.8}>
                <Text style={[s.chipText, { color: on ? '#fff' : theme.textSub }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {groups.map(([day, items]) => (
          <View key={day} style={{ marginTop: 18 }}>
            <Text style={s.day}>{day}</Text>
            <View style={{ gap: 9, marginTop: 10 }}>
              {items.map((a) => {
                const cam = a.cameraId ? cameras.find((c) => c.id === a.cameraId) : undefined;
                const poster = cam ? streamPosters[cam.id] : null;
                const sys = SYSTEM_TYPES.has(a.type);
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={s.row}
                    activeOpacity={0.85}
                    onPress={() => a.cameraId && onOpenCamera(a.cameraId)}
                  >
                    <View style={s.thumb}>
                      {poster ? (
                        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : (
                        <View style={[StyleSheet.absoluteFill, s.thumbEmpty]}>
                          <Icon name={sys ? 'server' : 'aperture'} size={15} color={theme.textMuted} />
                        </View>
                      )}
                      <View style={[s.typeDot, { backgroundColor: sys ? theme.warning : theme.accent }]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{(() => { const k = labelForEvent(a.type); return k !== 'Evento detectado' ? k : (a.title || k); })()}</Text>
                      <Text style={s.rowSub} numberOfLines={1}>{(a.cameraName || cam?.name || 'Sistema')}</Text>
                    </View>
                    <Text style={s.time}>{new Date(a.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        {alarms.length === 0 ? <Text style={s.empty}>Nenhum evento ainda.</Text> : null}
      </ScrollView>
    </View>
  );
}

function makeStyles(t: any) {
  return StyleSheet.create({
    root: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 110 },
    title: { fontFamily: TITLE, fontSize: 26, fontWeight: '800', color: t.text, letterSpacing: -0.5, marginBottom: 14 },
    chips: { flexDirection: 'row', gap: 8 },
    chip: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 16, height: 36, alignItems: 'center', justifyContent: 'center' },
    chipOn: { backgroundColor: t.accent, borderColor: t.accent },
    chipText: { fontFamily: UI, fontSize: 13, fontWeight: '600' },
    day: { fontFamily: MONO, fontSize: 11, fontWeight: '600', letterSpacing: 1, color: t.textMuted },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 10 },
    thumb: { width: 56, height: 44, borderRadius: 11, overflow: 'hidden', backgroundColor: '#0D1118' },
    thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceAlt },
    typeDot: { position: 'absolute', top: 6, left: 6, width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(5,8,14,0.5)' },
    rowTitle: { fontFamily: UI, fontSize: 14, fontWeight: '600', color: t.text },
    rowSub: { fontFamily: UI, fontSize: 12, color: t.textSub, marginTop: 2 },
    time: { fontFamily: MONO, fontSize: 12, color: t.textMuted },
    empty: { fontFamily: UI, fontSize: 14, color: t.textMuted, textAlign: 'center', paddingVertical: 40 },
  });
}
