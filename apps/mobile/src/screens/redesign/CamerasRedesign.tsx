/**
 * Câmeras (redesign) — réplica da tela "Câmeras" do mockup: busca, chips de grupo,
 * alternância Lista/Mural, favoritos. Ligada aos dados reais (mesmos props da MosaicScreen).
 */
import { useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../components/Icon';
import { isOnlineStatus } from '../../utils/camera-view';
import type { Camera } from '../../types';

const TITLE = 'Sora';
const UI = 'InstrumentSans';

interface Props {
  cameras: Camera[];
  streamPosters: Record<string, string | null>;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenCamera: (camera: Camera) => void;
}

export function CamerasRedesign({ cameras, streamPosters, refreshing, onRefresh, onOpenCamera }: Props) {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Todas');
  const [view, setView] = useState<'list' | 'mosaic'>('list');
  const [favs, setFavs] = useState<string[]>([]);
  const s = makeStyles(theme);

  const groups = useMemo(() => {
    const names = new Set<string>();
    cameras.forEach((c) => c.group?.name && names.add(c.group.name));
    return ['Todas', ...Array.from(names)];
  }, [cameras]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = cameras.filter((c) => {
      const okGroup = group === 'Todas' || c.group?.name === group;
      const okQuery = !q || c.name.toLowerCase().includes(q);
      return okGroup && okQuery;
    });
    // favoritas primeiro
    list = [...list].sort((a, b) => Number(favs.includes(b.id)) - Number(favs.includes(a.id)));
    return list;
  }, [cameras, query, group, favs]);

  const onlineCount = cameras.filter((c) => isOnlineStatus(c.status)).length;
  const toggleFav = (id: string) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        contentContainerStyle={s.root}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Câmeras</Text>
            <Text style={s.subtitle}>{onlineCount} de {cameras.length} online</Text>
          </View>
          <View style={s.toggle}>
            <TouchableOpacity style={[s.toggleBtn, view === 'list' && s.toggleOn]} onPress={() => setView('list')}>
              <Icon name="server" size={17} color={view === 'list' ? '#fff' : theme.textSub} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.toggleBtn, view === 'mosaic' && s.toggleOn]} onPress={() => setView('mosaic')}>
              <Icon name="grid" size={17} color={view === 'mosaic' ? '#fff' : theme.textSub} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Busca */}
        <View style={s.search}>
          <Icon name="aperture" size={17} color={theme.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Buscar câmera…"
            placeholderTextColor={theme.textMuted}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}><Icon name="close" size={16} color={theme.textMuted} /></TouchableOpacity>
          ) : null}
        </View>

        {/* Chips de grupo */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {groups.map((g) => {
            const on = group === g;
            const count = g === 'Todas' ? cameras.length : cameras.filter((c) => c.group?.name === g).length;
            return (
              <TouchableOpacity key={g} style={[s.chip, on && s.chipOn]} onPress={() => setGroup(g)} activeOpacity={0.8}>
                <Text style={[s.chipText, { color: on ? '#fff' : theme.textSub }]}>{g}</Text>
                <View style={[s.chipCount, on && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[s.chipCountText, { color: on ? '#fff' : theme.textSub }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Lista */}
        {view === 'list' ? (
          <View style={{ gap: 10, marginTop: 14 }}>
            {filtered.map((cam) => <ListRow key={cam.id} cam={cam} poster={streamPosters[cam.id]} theme={theme} s={s} fav={favs.includes(cam.id)} onToggleFav={() => toggleFav(cam.id)} onOpen={() => onOpenCamera(cam)} />)}
          </View>
        ) : (
          <View style={s.grid}>
            {filtered.map((cam) => <MosaicTile key={cam.id} cam={cam} poster={streamPosters[cam.id]} theme={theme} s={s} fav={favs.includes(cam.id)} onToggleFav={() => toggleFav(cam.id)} onOpen={() => onOpenCamera(cam)} />)}
          </View>
        )}
        {filtered.length === 0 ? <Text style={s.empty}>Nenhuma câmera encontrada.</Text> : null}
      </ScrollView>
    </View>
  );
}

function ListRow({ cam, poster, theme, s, fav, onToggleFav, onOpen }: any) {
  const isOn = isOnlineStatus(cam.status);
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.85} onPress={onOpen}>
      <View style={s.rowThumb}>
        {isOn && poster ? (
          <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.thumbEmpty]}><Icon name="camera" size={16} color={theme.textMuted} /></View>
        )}
        {isOn ? (
          <View style={s.liveBadgeSm}><View style={s.liveDotSm} /><Text style={s.liveTextSm}>AO VIVO</Text></View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {fav ? <Icon name="star" size={13} color={theme.warning} /> : null}
          <Text style={s.rowName} numberOfLines={1}>{cam.name}</Text>
        </View>
        <Text style={s.rowSub} numberOfLines={1}>
          {(cam.group?.name ?? 'Câmera')} · {isOn ? 'online' : 'offline'}
        </Text>
      </View>
      <TouchableOpacity onPress={onToggleFav} hitSlop={10}>
        <Icon name="star" size={20} color={fav ? theme.warning : theme.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function MosaicTile({ cam, poster, theme, s, fav, onToggleFav, onOpen }: any) {
  const isOn = isOnlineStatus(cam.status);
  return (
    <TouchableOpacity style={s.tile} activeOpacity={0.85} onPress={onOpen}>
      {isOn && poster ? (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.thumbEmpty]}><Icon name="camera" size={18} color={theme.textMuted} /></View>
      )}
      <View style={s.tileShade} />
      {isOn ? <View style={[s.liveBadgeSm, { top: 8, left: 8 }]}><View style={s.liveDotSm} /><Text style={s.liveTextSm}>AO VIVO</Text></View> : null}
      <TouchableOpacity style={s.tileStar} onPress={onToggleFav} hitSlop={8}>
        <Icon name="star" size={16} color={fav ? theme.warning : '#fff'} />
      </TouchableOpacity>
      <View style={s.tileFooter}>
        <Text style={s.tileName} numberOfLines={1}>{cam.name}</Text>
        <Text style={s.tileArea} numberOfLines={1}>{cam.group?.name ?? 'Câmera'}</Text>
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(t: any) {
  return StyleSheet.create({
    root: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 110 },
    header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
    title: { fontFamily: TITLE, fontSize: 26, fontWeight: '800', color: t.text, letterSpacing: -0.5 },
    subtitle: { fontFamily: UI, fontSize: 13, color: t.textSub, marginTop: 2 },
    toggle: { flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: 12, padding: 4, gap: 2 },
    toggleBtn: { width: 40, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    toggleOn: { backgroundColor: t.accent },

    search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, paddingHorizontal: 14, height: 48 },
    searchInput: { flex: 1, fontFamily: UI, fontSize: 15, color: t.text, padding: 0 },

    chips: { gap: 8, marginTop: 14, paddingRight: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 14, height: 38 },
    chipOn: { backgroundColor: t.accent, borderColor: t.accent },
    chipText: { fontFamily: UI, fontSize: 13, fontWeight: '600' },
    chipCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    chipCountText: { fontFamily: UI, fontSize: 11, fontWeight: '700' },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 10 },
    rowThumb: { width: 104, height: 70, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0D1118' },
    thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceAlt },
    rowName: { fontFamily: UI, fontSize: 15, fontWeight: '600', color: t.text, flexShrink: 1 },
    rowSub: { fontFamily: UI, fontSize: 12, color: t.textSub, marginTop: 3 },
    liveBadgeSm: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(214,55,48,0.95)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
    liveDotSm: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff' },
    liveTextSm: { color: '#fff', fontFamily: UI, fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 14 },
    tile: { width: '47.5%', flexGrow: 1, aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0D1118' },
    tileShade: { ...StyleSheet.absoluteFillObject },
    tileStar: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(5,8,14,0.4)', alignItems: 'center', justifyContent: 'center' },
    tileFooter: { position: 'absolute', left: 10, right: 10, bottom: 10 },
    tileName: { color: '#fff', fontFamily: UI, fontSize: 13, fontWeight: '700' },
    tileArea: { color: 'rgba(255,255,255,0.7)', fontFamily: UI, fontSize: 11, marginTop: 1 },

    empty: { fontFamily: UI, fontSize: 14, color: t.textMuted, textAlign: 'center', paddingVertical: 30 },
  });
}
