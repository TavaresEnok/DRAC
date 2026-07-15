/**
 * SettingsScreen — perfil real, conexão, aparência e logout.
 */
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Icon, type IconName } from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import type { User } from '../types';

interface SettingsScreenProps {
  user: User | null;
  apiUrl: string;
  connected: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  biometricLabel: string;
  onBiometricChange: (enabled: boolean) => void;
  onLogout: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'SUPER ADMIN',
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERADOR',
  VIEWER: 'VIEWER',
};

function initialsOf(name?: string): string {
  if (!name) return 'DR';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'DR';
}

export function SettingsScreen({
  user, connected, biometricAvailable, biometricEnabled, biometricLabel, onBiometricChange, onLogout,
}: SettingsScreenProps) {
  const { theme, themeMode, setThemeMode } = useTheme();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: theme.bgText }]}>Ajustes</Text>

      {/* Perfil */}
      <View style={[styles.profile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <LinearGradient colors={[theme.accent, theme.accentDark]} style={styles.avatar}>
          <Text style={[styles.avatarText, { color: theme.textOnAccent }]}>{initialsOf(user?.name)}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{user?.name ?? 'Usuário'}</Text>
          <Text style={[styles.email, { color: theme.textSub }]} numberOfLines={1}>{user?.email ?? ''}</Text>
        </View>
        {user ? <Text style={[styles.roleChip, { color: theme.accent, backgroundColor: theme.accentBg }]}>{ROLE_LABEL[user.role] ?? user.role}</Text> : null}
      </View>

      <Text style={[styles.groupLabel, { color: theme.textMuted }]}>APARÊNCIA</Text>
      <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.themeRow}>
          {([
            { id: 'system' as const, label: 'Sistema', icon: 'settings' as const },
            { id: 'dark' as const, label: 'Escuro', icon: 'moon' as const },
            { id: 'light' as const, label: 'Claro', icon: 'sun' as const },
          ]).map((item) => {
            const selected = themeMode === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setThemeMode(item.id)}
                accessibilityRole="radio"
                accessibilityLabel={`Tema ${item.label.toLowerCase()}`}
                accessibilityState={{ checked: selected }}
                style={[
                  styles.themeOption,
                  { backgroundColor: selected ? theme.accentBg : theme.surfaceAlt, borderColor: selected ? theme.accent : theme.border },
                ]}
              >
                <Icon name={item.icon} size={17} color={selected ? theme.accent : theme.textSub} strokeWidth={2} />
                <Text style={[styles.themeOptionText, { color: selected ? theme.accent : theme.textSub }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={[styles.groupLabel, { color: theme.textMuted }]}>SEGURANÇA</Text>
      <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Row
          icon="lock"
          iconBg={theme.accentBg}
          iconColor={theme.accent}
          title="Acesso por biometria"
          subtitle={biometricAvailable ? biometricLabel : 'Cadastre a biometria nos ajustes do aparelho'}
          theme={theme}
          right={(
            <Switch
              value={biometricEnabled}
              onValueChange={onBiometricChange}
              accessibilityLabel="Ativar acesso por biometria"
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.surface}
            />
          )}
        />
      </View>

      {/* Conexão */}
      <Text style={[styles.groupLabel, { color: theme.textMuted }]}>CONEXÃO</Text>
      <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Row
          icon={connected ? 'check' : 'alert'}
          iconBg={connected ? 'rgba(34,197,94,0.14)' : theme.dangerBg}
          iconColor={connected ? theme.success : theme.danger}
          title="Conexão"
          subtitle={connected ? 'Conectado' : 'Servidor indisponível'}
          subtitleColor={connected ? theme.success : theme.danger}
          theme={theme}
        />
      </View>

      {/* Preferências: "Notificações push" removido até o recurso funcionar de
          verdade (evita mostrar um botão que não faz nada — e pergunta do
          revisor da Play Store). Voltará quando o push (FCM) estiver ativo. */}

      {/* Logout */}
      <Pressable
        onPress={onLogout}
        accessibilityRole="button"
        accessibilityLabel="Sair da conta"
        style={[styles.logout, { backgroundColor: theme.dangerBg, borderColor: 'rgba(239,68,68,0.28)' }]}
      >
        <Icon name="logout" size={18} color={theme.danger} strokeWidth={2} />
        <Text style={[styles.logoutText, { color: theme.danger }]}>Sair da conta</Text>
      </Pressable>
      <Text style={[styles.version, { color: theme.textMuted }]}>DRAC VMS · versão {Constants.expoConfig?.version ?? '—'}</Text>
    </ScrollView>
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
        {subtitle ? <Text style={[styles.rowSubtitle, { color: subtitleColor ?? theme.textSub }]} numberOfLines={1}>{subtitle}</Text> : null}
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
  avatarText: { fontSize: 20, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '800' },
  email: { fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  roleChip: { fontSize: 10, fontWeight: '800', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, overflow: 'hidden', letterSpacing: 0.4 },
  groupLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginLeft: 4, marginBottom: 8 },
  group: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 18 },
  themeRow: { flexDirection: 'row', gap: 9, padding: 10 },
  themeOption: { flex: 1, height: 42, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  themeOptionText: { fontSize: 12.5, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, paddingHorizontal: 15 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13.5, fontWeight: '700' },
  rowSubtitle: { fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 15, marginBottom: 14 },
  logoutText: { fontSize: 14, fontWeight: '800' },
  version: { textAlign: 'center', fontSize: 11.5, fontWeight: '600' },
});
