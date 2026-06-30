/**
 * SettingsScreen — perfil, aparência (tema), servidor, preferências e logout.
 * O seletor de tema usa o ThemeProvider (claro/escuro) de verdade.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Icon, type IconName } from '../components/Icon';
import { mockUser } from '../data/mock';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeMode } from '../theme/theme';

interface SettingsScreenProps {
  onLogout: () => void;
}

export function SettingsScreen({ onLogout }: SettingsScreenProps) {
  const { theme, mode, setMode } = useTheme();
  const [notifications, setNotifications] = useState(true);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>Ajustes</Text>

        {/* Perfil */}
        <View style={[styles.profile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <LinearGradient colors={[theme.accent, theme.accentDark]} style={styles.avatar}>
            <Text style={styles.avatarText}>{mockUser.initials}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]}>{mockUser.name}</Text>
            <Text style={[styles.email, { color: theme.textSub }]}>{mockUser.email}</Text>
          </View>
          <Text style={[styles.roleChip, { color: theme.accent, backgroundColor: theme.accentBg }]}>{mockUser.role}</Text>
        </View>

        {/* Aparência */}
        <Text style={[styles.groupLabel, { color: theme.textMuted }]}>APARÊNCIA</Text>
        <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border, padding: 14 }]}>
          <Text style={[styles.themeTitle, { color: theme.text }]}>Tema do aplicativo</Text>
          <View style={styles.themeRow}>
            <ThemeOption label="Escuro" icon="moon" value="dark" bg="#0b0d12" active={mode === 'dark'} accent={theme.accent} textSub={theme.textSub} onPress={setMode} />
            <ThemeOption label="Claro" icon="sun" value="light" bg="#eef0f4" active={mode === 'light'} accent={theme.accent} textSub={theme.textSub} onPress={setMode} />
          </View>
        </View>

        {/* Servidor */}
        <Text style={[styles.groupLabel, { color: theme.textMuted }]}>SERVIDOR</Text>
        <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Row icon="server" iconBg={theme.accentBg} iconColor={theme.accent} title="URL da API" subtitle="https://drac.local/api" theme={theme} divider />
          <Row icon="check" iconBg="rgba(34,197,94,0.14)" iconColor={theme.success} title="Conexão" subtitle="Conectado · 18 ms" subtitleColor={theme.success} theme={theme} />
        </View>

        {/* Preferências */}
        <Text style={[styles.groupLabel, { color: theme.textMuted }]}>PREFERÊNCIAS</Text>
        <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Row
            icon="bell" iconBg={theme.surfaceAlt} iconColor={theme.textSub} title="Notificações push" theme={theme} divider
            right={<Switch value={notifications} onValueChange={setNotifications} trackColor={{ true: theme.accent, false: theme.surfaceAlt }} thumbColor="#fff" />}
          />
          <Row
            icon="camera" iconBg={theme.surfaceAlt} iconColor={theme.textSub} title="Qualidade de vídeo" theme={theme}
            right={
              <View style={styles.valueRow}>
                <Text style={[styles.valueText, { color: theme.textSub }]}>Auto</Text>
                <Icon name="chevronRight" size={16} color={theme.textMuted} strokeWidth={2} />
              </View>
            }
          />
        </View>

        {/* Logout */}
        <Pressable onPress={onLogout} style={[styles.logout, { backgroundColor: theme.dangerBg, borderColor: 'rgba(239,68,68,0.28)' }]}>
          <Icon name="logout" size={18} color={theme.danger} strokeWidth={2} />
          <Text style={[styles.logoutText, { color: theme.danger }]}>Sair da conta</Text>
        </Pressable>
        <Text style={[styles.version, { color: theme.textMuted }]}>DRAC VMS · versão 2.0.0</Text>
      </View>
    </View>
  );
}

function ThemeOption({
  label, icon, value, bg, active, accent, textSub, onPress,
}: {
  label: string; icon: IconName; value: ThemeMode; bg: string; active: boolean;
  accent: string; textSub: string; onPress: (m: ThemeMode) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(value)}
      style={[styles.themeOption, { backgroundColor: bg, borderColor: active ? accent : 'transparent' }]}
    >
      <View style={[styles.themeSwatch, { backgroundColor: value === 'dark' ? '#15181f' : '#fff', borderColor: value === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }]} />
      <View style={styles.themeOptionLabel}>
        <Icon name={icon} size={14} color={active ? accent : textSub} strokeWidth={2} />
        <Text style={[styles.themeOptionText, { color: active ? accent : textSub }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function Row({
  icon, iconBg, iconColor, title, subtitle, subtitleColor, right, theme, divider,
}: {
  icon: IconName; iconBg: string; iconColor: string; title: string;
  subtitle?: string; subtitleColor?: string; right?: React.ReactNode; theme: ReturnType<typeof useTheme>['theme']; divider?: boolean;
}) {
  return (
    <View style={[styles.row, divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={18} color={iconColor} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSubtitle, { color: subtitleColor ?? theme.textSub }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 24 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.5, marginTop: 10, marginBottom: 16 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 18 },
  avatar: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '800' },
  email: { fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  roleChip: { fontSize: 10, fontWeight: '800', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, overflow: 'hidden', letterSpacing: 0.4 },
  groupLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginLeft: 4, marginBottom: 8 },
  group: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 18 },
  themeTitle: { fontSize: 13.5, fontWeight: '700', marginBottom: 11 },
  themeRow: { flexDirection: 'row', gap: 9 },
  themeOption: { flex: 1, borderRadius: 13, borderWidth: 2, paddingVertical: 13, paddingHorizontal: 10, alignItems: 'center', gap: 8 },
  themeSwatch: { width: 26, height: 18, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth },
  themeOptionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  themeOptionText: { fontSize: 12.5, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, paddingHorizontal: 15 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13.5, fontWeight: '700' },
  rowSubtitle: { fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valueText: { fontSize: 12.5, fontWeight: '700' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 15, marginBottom: 14 },
  logoutText: { fontSize: 14, fontWeight: '800' },
  version: { textAlign: 'center', fontSize: 11.5, fontWeight: '600' },
});
