/** LoginScreen — autenticação. Wire onSubmit ao POST /auth/login na produção. */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';

interface LoginScreenProps {
  onSubmit: (email: string, password: string) => void;
}

export function LoginScreen({ onSubmit }: LoginScreenProps) {
  const { theme } = useTheme();
  const [email, setEmail] = useState('enok@drac.io');
  const [password, setPassword] = useState('drac1234');
  const [show, setShow] = useState(false);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <LinearGradient
        colors={[theme.accentBg, 'transparent']}
        start={{ x: 0.8, y: 0 }}
        end={{ x: 0.3, y: 0.6 }}
        style={styles.glow}
        pointerEvents="none"
      />

      <View style={styles.hero}>
        <LinearGradient colors={[theme.accent, theme.accentDark]} style={styles.logo}>
          <Icon name="aperture" size={40} color="#fff" />
        </LinearGradient>
        <Text style={[styles.brand, { color: theme.text }]}>DRAC</Text>
        <Text style={[styles.tagline, { color: theme.textSub }]}>Monitoramento inteligente</Text>
      </View>

      <View style={styles.form}>
        <View style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="mail" size={19} color={theme.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>E-MAIL</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={theme.textMuted}
              style={[styles.input, { color: theme.text }]}
            />
          </View>
        </View>

        <View style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="lock" size={19} color={theme.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>SENHA</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!show}
              placeholderTextColor={theme.textMuted}
              style={[styles.input, { color: theme.text }]}
            />
          </View>
          <Pressable onPress={() => setShow((s) => !s)} hitSlop={10}>
            <Icon name="eye" size={19} color={theme.textMuted} />
          </Pressable>
        </View>

        <Text style={[styles.forgot, { color: theme.accent }]}>Esqueci minha senha</Text>

        <Pressable onPress={() => onSubmit(email, password)}>
          <LinearGradient colors={[theme.accent, theme.accentDark]} style={styles.cta}>
            <Text style={styles.ctaText}>Entrar</Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.serverRow}>
          <View style={[styles.dot, { backgroundColor: theme.success }]} />
          <Text style={[styles.serverText, { color: theme.textSub }]}>Servidor conectado · drac.local</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 30 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  logo: { width: 78, height: 78, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  tagline: { fontSize: 14, fontWeight: '500', marginTop: -8 },
  form: { gap: 13, paddingBottom: 48 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 11 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  input: { fontSize: 15, fontWeight: '600', padding: 0, marginTop: 1 },
  forgot: { textAlign: 'right', fontSize: 12.5, fontWeight: '700' },
  cta: { borderRadius: 15, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  serverRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  serverText: { fontSize: 11.5, fontWeight: '600' },
});
