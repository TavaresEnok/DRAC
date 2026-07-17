/**
 * Personalização do app (redesign) — Configuração → Personalização do app.
 * Começa no PADRÃO do mockup; o cliente pode trocar o accent; "Usar padrão" volta ao
 * mockup. Só do app (não toca no sistema/servidor). Ver appPersonalization.ts.
 */
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../components/Icon';
import { ACCENT_PRESETS, DEFAULT_ACCENT } from '../../theme/appPersonalization';

const TITLE = 'Sora';
const UI = 'InstrumentSans';
const MONO = 'JetBrainsMono';

export function PersonalizationRedesign({ onBack }: { onBack: () => void }) {
  const { theme, appAccent, setAppAccent } = useTheme();
  const s = makeStyles(theme);
  const current = appAccent ?? DEFAULT_ACCENT;
  const isDefault = !appAccent || appAccent.toLowerCase() === DEFAULT_ACCENT.toLowerCase();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={s.root} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={onBack} activeOpacity={0.8}>
            <Icon name="close" size={18} color={theme.text} />
          </TouchableOpacity>
          <Text style={s.title}>Personalização do app</Text>
        </View>

        <Text style={s.intro}>
          Escolha a cor de destaque do app. O padrão é o tema DRAC; a qualquer momento você
          pode voltar a ele.
        </Text>

        {/* Prévia */}
        <View style={s.previewCard}>
          <View style={[s.previewBtn, { backgroundColor: current }]}>
            <Text style={s.previewBtnText}>Botão de destaque</Text>
          </View>
          <View style={s.previewRow}>
            <View style={[s.previewDot, { backgroundColor: current }]} />
            <Text style={[s.previewLink, { color: current }]}>Link e ícone ativo</Text>
          </View>
        </View>

        <Text style={s.section}>Cor de destaque</Text>
        <View style={s.swatches}>
          {ACCENT_PRESETS.map((p) => {
            const selected = current.toLowerCase() === p.color.toLowerCase();
            return (
              <TouchableOpacity
                key={p.id}
                style={s.swatchWrap}
                activeOpacity={0.8}
                onPress={() => setAppAccent(p.id === 'default' ? null : p.color)}
              >
                <View style={[s.swatch, { backgroundColor: p.color }, selected && s.swatchSelected]}>
                  {selected ? <Icon name="check" size={18} color="#fff" /> : null}
                </View>
                <Text style={s.swatchLabel}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[s.defaultBtn, isDefault && s.defaultBtnDisabled]}
          activeOpacity={0.85}
          disabled={isDefault}
          onPress={() => setAppAccent(null)}
        >
          <Icon name="aperture" size={17} color={isDefault ? theme.textMuted : theme.accent} />
          <Text style={[s.defaultText, { color: isDefault ? theme.textMuted : theme.accent }]}>
            {isDefault ? 'Já está no padrão' : 'Usar padrão'}
          </Text>
        </TouchableOpacity>

        <Text style={s.note}>A personalização vale só para este app, não altera o sistema.</Text>
      </ScrollView>
    </View>
  );
}

function makeStyles(t: any) {
  return StyleSheet.create({
    root: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 110 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: TITLE, fontSize: 22, fontWeight: '800', color: t.text, letterSpacing: -0.4, flex: 1 },
    intro: { fontFamily: UI, fontSize: 14, color: t.textSub, lineHeight: 21, marginBottom: 18 },

    previewCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 16, gap: 14 },
    previewBtn: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    previewBtnText: { fontFamily: UI, fontSize: 15, fontWeight: '700', color: '#fff' },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    previewDot: { width: 9, height: 9, borderRadius: 5 },
    previewLink: { fontFamily: UI, fontSize: 14, fontWeight: '600' },

    section: { fontFamily: MONO, fontSize: 11, fontWeight: '600', letterSpacing: 1, color: t.textMuted, marginTop: 24, marginBottom: 12, marginLeft: 2 },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    swatchWrap: { alignItems: 'center', gap: 7, width: 64 },
    swatch: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
    swatchSelected: { borderColor: t.text },
    swatchLabel: { fontFamily: UI, fontSize: 11, color: t.textSub },

    defaultBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 26, height: 52, borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
    defaultBtnDisabled: { opacity: 0.6 },
    defaultText: { fontFamily: UI, fontSize: 15, fontWeight: '700' },
    note: { fontFamily: UI, fontSize: 12.5, color: t.textMuted, textAlign: 'center', marginTop: 16 },
  });
}
