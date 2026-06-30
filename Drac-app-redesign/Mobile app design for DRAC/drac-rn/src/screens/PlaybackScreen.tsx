/**
 * PlaybackScreen — seleção de câmera, scrubber, dias, timeline e lista de gravações.
 * Inclui modo de seleção múltipla + download em lote.
 * Produção: usar expo-video para HLS/MP4; download → POST /recordings/export { ids }.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { mockRecordings } from '../data/mock';
import { useTheme } from '../theme/ThemeProvider';

const DAYS = [
  { wd: 'QUI', d: 12, disabled: false },
  { wd: 'SEX', d: 13, disabled: false },
  { wd: 'SÁB', d: 14, disabled: false },
  { wd: 'DOM', d: 15, disabled: true },
];

export function PlaybackScreen() {
  const { theme } = useTheme();
  const [selected, setSelected] = useState(14);
  const [selectMode, setSelectMode] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);

  const allChosen = chosen.length === mockRecordings.length && mockRecordings.length > 0;

  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const toggleAll = () =>
    setChosen(allChosen ? [] : mockRecordings.map((r) => r.id));
  const exitSelect = () => { setSelectMode(false); setChosen([]); };
  const download = () => { if (chosen.length) exitSelect(); };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, selectMode && { paddingBottom: 96 }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.text }]}>Reprodução</Text>

        {/* Seletor de câmera */}
        <View style={[styles.selector, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.selectorLeft}>
            <View style={[styles.dot, { backgroundColor: theme.success }]} />
            <Text style={[styles.selectorText, { color: theme.text }]}>Entrada Principal</Text>
          </View>
          <Icon name="chevronDown" size={18} color={theme.textSub} strokeWidth={2} />
        </View>

        {/* Player */}
        <View style={[styles.player, { borderColor: theme.border }]}>
          <LinearGradient colors={['#1f2937', '#0b1018']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.playerDate}>14 fev · 14:12:30</Text>
          <View style={styles.playFab}>
            <Icon name="play" size={24} color="#fff" fill />
          </View>
          <View style={styles.scrubber}>
            <View style={styles.scrubTrack}>
              <View style={[styles.scrubFill, { backgroundColor: theme.accent }]} />
              <View style={styles.scrubHead} />
            </View>
          </View>
        </View>

        {/* Carrossel de dias */}
        <View style={styles.daysRow}>
          <View style={[styles.dayNav, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Icon name="chevronLeft" size={16} color={theme.textSub} strokeWidth={2.2} />
          </View>
          <View style={styles.days}>
            {DAYS.map((day) => {
              const on = day.d === selected;
              return (
                <Pressable
                  key={day.d}
                  onPress={() => !day.disabled && setSelected(day.d)}
                  style={[styles.day, { backgroundColor: theme.surface, borderColor: theme.border }, day.disabled && { opacity: 0.5 }]}
                >
                  {on ? <LinearGradient colors={[theme.accent, theme.accentDark]} style={StyleSheet.absoluteFill} /> : null}
                  <Text style={[styles.dayWd, { color: on ? 'rgba(255,255,255,0.85)' : theme.textSub }]}>{day.wd}</Text>
                  <Text style={[styles.dayNum, { color: on ? '#fff' : theme.text }]}>{day.d}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.dayNav, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, opacity: 0.5 }]}>
            <Icon name="chevronRight" size={16} color={theme.textMuted} strokeWidth={2.2} />
          </View>
        </View>

        {/* Timeline 24h melhorada */}
        <View style={[styles.timelineCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.tlHeader}>
            <View style={styles.tlTitleRow}>
              <Icon name="clock" size={15} color={theme.textSub} strokeWidth={2} />
              <Text style={[styles.tlTitle, { color: theme.text }]}>Linha do tempo</Text>
            </View>
            <View style={styles.tlLegend}>
              <View style={styles.tlLegendItem}><View style={[styles.tlSwatch, { backgroundColor: theme.tlBlue }]} /><Text style={[styles.tlLegendText, { color: theme.textSub }]}>Contínua</Text></View>
              <View style={styles.tlLegendItem}><View style={[styles.tlSwatch, { backgroundColor: theme.tlOrange }]} /><Text style={[styles.tlLegendText, { color: theme.textSub }]}>Movimento</Text></View>
            </View>
          </View>
          <View style={styles.tlBody}>
            <View style={[styles.tlBubble, { backgroundColor: theme.tlHead }]}>
              <Text style={styles.tlBubbleText}>14:12</Text>
            </View>
            <View style={[styles.timeline, { backgroundColor: theme.surfaceAlt }]}>
              <View style={[styles.tlSeg, { left: '8%', width: '22%', backgroundColor: theme.tlBlue }]} />
              <View style={[styles.tlSeg, { left: '34%', width: '6%', backgroundColor: theme.tlOrange }]} />
              <View style={[styles.tlSeg, { left: '48%', width: '18%', backgroundColor: theme.tlBlue }]} />
              <View style={[styles.tlSeg, { left: '70%', width: '4%', backgroundColor: theme.tlOrange }]} />
            </View>
            <View style={[styles.tlPlayhead, { backgroundColor: theme.tlHead }]} />
            <View style={[styles.tlPlayheadDot, { backgroundColor: theme.tlHead, borderColor: theme.surface }]} />
            <View style={styles.tlTicks}>
              {['00h', '06h', '12h', '18h', '24h'].map((t) => (
                <Text key={t} style={[styles.tlTick, { color: theme.textMuted }]}>{t}</Text>
              ))}
            </View>
          </View>
        </View>

        {/* Lista de gravações */}
        <View style={styles.listHeader}>
          <Text style={[styles.listTitle, { color: theme.text }]}>Gravações · 14 fev</Text>
          <Pressable onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}>
            <Text style={[styles.selectToggle, { color: selectMode ? theme.danger : theme.accent }]}>{selectMode ? 'Cancelar' : 'Selecionar'}</Text>
          </Pressable>
        </View>

        {selectMode ? (
          <Pressable style={styles.selectAll} onPress={toggleAll}>
            <View style={[styles.checkbox, { backgroundColor: allChosen ? theme.accent : 'transparent', borderColor: allChosen ? theme.accent : theme.border }]}>
              {allChosen ? <Icon name="check" size={13} color="#fff" strokeWidth={3} /> : null}
            </View>
            <Text style={[styles.selectAllText, { color: theme.textSub }]}>Selecionar todas</Text>
          </Pressable>
        ) : null}

        <View style={{ gap: 9 }}>
          {mockRecordings.map((rec) => {
            const tagColor = rec.kind === 'CONTÍNUA' ? theme.textSub : theme.warning;
            const tagBg = rec.kind === 'CONTÍNUA' ? theme.surfaceAlt : 'rgba(245,158,11,0.14)';
            const checked = chosen.includes(rec.id);
            return (
              <Pressable
                key={rec.id}
                onPress={() => selectMode && toggle(rec.id)}
                style={[styles.recRow, { backgroundColor: selectMode && checked ? theme.accentBg : theme.surface, borderColor: selectMode && checked ? theme.accent : theme.border }]}
              >
                {selectMode ? (
                  <View style={[styles.checkbox, { backgroundColor: checked ? theme.accent : 'transparent', borderColor: checked ? theme.accent : theme.border }]}>
                    {checked ? <Icon name="check" size={14} color="#fff" strokeWidth={3} /> : null}
                  </View>
                ) : null}
                <LinearGradient colors={rec.tint} style={styles.recThumb} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recRange, { color: theme.text }]}>{rec.range}</Text>
                  <View style={styles.recMeta}>
                    <Text style={[styles.recDuration, { color: theme.textSub }]}>{rec.duration}</Text>
                    <Text style={[styles.recTag, { color: tagColor, backgroundColor: tagBg }]}>{rec.kind}</Text>
                    <Text style={[styles.recDuration, { color: theme.textMuted }]}>{rec.size}</Text>
                  </View>
                </View>
                {!selectMode ? <Icon name="download" size={19} color={theme.accent} strokeWidth={2} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Barra de download */}
      {selectMode ? (
        <View style={styles.downloadBar} pointerEvents="box-none">
          <Pressable onPress={download} disabled={chosen.length === 0}>
            <LinearGradient colors={[theme.accent, theme.accentDark]} style={[styles.downloadBtn, { opacity: chosen.length ? 1 : 0.45 }]}>
              <Icon name="download" size={19} color="#fff" strokeWidth={2.1} />
              <Text style={styles.downloadText}>
                {chosen.length ? `Baixar ${chosen.length} ${chosen.length === 1 ? 'gravação' : 'gravações'}` : 'Selecione gravações'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 24, gap: 14 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.5, marginTop: 10 },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 12, paddingHorizontal: 15 },
  selectorLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  selectorText: { fontSize: 14, fontWeight: '700' },
  player: { height: 200, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, position: 'relative' },
  playerDate: { position: 'absolute', top: 12, left: 12, color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 8, overflow: 'hidden' },
  playFab: { position: 'absolute', top: '50%', left: '50%', marginTop: -29, marginLeft: -29, width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  scrubber: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  scrubTrack: { height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', position: 'relative' },
  scrubFill: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '42%', borderRadius: 3 },
  scrubHead: { position: 'absolute', left: '42%', top: -3.5, marginLeft: -5.5, width: 11, height: 11, borderRadius: 6, backgroundColor: '#fff' },
  daysRow: { flexDirection: 'row', gap: 7, alignItems: 'stretch' },
  dayNav: { width: 44, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  days: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  day: { flex: 1, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 9, alignItems: 'center', overflow: 'hidden' },
  dayWd: { fontSize: 10, fontWeight: '700' },
  dayNum: { fontSize: 15, fontWeight: '800', marginTop: 1 },
  timelineCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 14, paddingHorizontal: 15 },
  tlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  tlTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tlTitle: { fontSize: 13, fontWeight: '800' },
  tlLegend: { flexDirection: 'row', gap: 12 },
  tlLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tlSwatch: { width: 9, height: 9, borderRadius: 3 },
  tlLegendText: { fontSize: 10.5, fontWeight: '700' },
  tlBody: { height: 46, position: 'relative' },
  tlBubble: { position: 'absolute', left: '59%', top: 0, transform: [{ translateX: -18 }], paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5 },
  tlBubbleText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  timeline: { position: 'absolute', left: 0, right: 0, top: 20, height: 14, borderRadius: 7, overflow: 'hidden' },
  tlSeg: { position: 'absolute', top: 0, bottom: 0, borderRadius: 7 },
  tlPlayhead: { position: 'absolute', left: '59%', top: 15, height: 24, width: 2.5, borderRadius: 2, transform: [{ translateX: -1 }] },
  tlPlayheadDot: { position: 'absolute', left: '59%', top: 16, width: 11, height: 11, borderRadius: 6, borderWidth: 2, transform: [{ translateX: -5.5 }] },
  tlTicks: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' },
  tlTick: { fontSize: 9.5, fontWeight: '700' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  listTitle: { fontSize: 14, fontWeight: '800' },
  selectToggle: { fontSize: 12.5, fontWeight: '700' },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: -4, paddingHorizontal: 2 },
  selectAllText: { fontSize: 12.5, fontWeight: '700' },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 11, paddingHorizontal: 13 },
  recThumb: { width: 44, height: 44, borderRadius: 11 },
  recRange: { fontSize: 13.5, fontWeight: '700' },
  recMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  recDuration: { fontSize: 11, fontWeight: '600' },
  recTag: { fontSize: 9.5, fontWeight: '800', paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6, overflow: 'hidden' },
  downloadBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 22 },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 15, paddingVertical: 15 },
  downloadText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
