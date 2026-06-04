import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

interface LoginScreenProps {
  apiUrl: string;
  email: string;
  password: string;
  loading: boolean;
  onApiUrlChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
}

export function LoginScreen({
  apiUrl,
  email,
  password,
  loading,
  onApiUrlChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginScreenProps) {
  return (
    <LinearGradient colors={['#f8fafc', '#eef2ff', '#ffffff']} style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <View style={styles.logoMark}>
            <View style={styles.logoLens} />
          </View>
          <Text style={styles.brand}>DRAC</Text>
          <Text style={styles.title}>Central de câmeras no bolso</Text>
          <Text style={styles.subtitle}>Ao vivo, PTZ, reprodução, alertas e gravação com acesso filtrado por grupo.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Servidor</Text>
          <TextInput value={apiUrl} onChangeText={onApiUrlChange} autoCapitalize="none" style={styles.input} placeholder="Endereço do servidor" placeholderTextColor="#8d877b" />
          <Text style={styles.label}>E-mail</Text>
          <TextInput value={email} onChangeText={onEmailChange} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholder="admin@local.dev" placeholderTextColor="#8d877b" />
          <Text style={styles.label}>Senha</Text>
          <TextInput value={password} onChangeText={onPasswordChange} secureTextEntry style={styles.input} placeholder="Sua senha" placeholderTextColor="#8d877b" />
          <Pressable disabled={loading} onPress={onSubmit} style={styles.primaryButton}>
            {loading ? <ActivityIndicator color="#f7f3ea" /> : <Text style={styles.primaryButtonText}>Entrar com segurança</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safe: { flex: 1, justifyContent: 'space-between', padding: 20, paddingTop: 64, paddingBottom: 28 },
  hero: { gap: 10 },
  logoMark: { width: 80, height: 80, borderRadius: 30, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', shadowColor: '#2563eb', shadowOpacity: 0.22, shadowRadius: 28, elevation: 12, borderWidth: 1, borderColor: '#dbeafe' },
  logoLens: { width: 36, height: 36, borderRadius: 18, borderWidth: 8, borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  brand: { color: '#2563eb', fontSize: 16, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase', marginTop: 8 },
  title: { color: '#111827', fontSize: 36, lineHeight: 40, fontWeight: '900', maxWidth: 340 },
  subtitle: { color: '#6b7280', fontSize: 15, lineHeight: 22, maxWidth: 350 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 32, padding: 18, gap: 8, shadowColor: '#111827', shadowOpacity: 0.12, shadowRadius: 30, elevation: 12 },
  label: { color: '#6b7280', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, marginLeft: 2, marginTop: 4 },
  input: { height: 54, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', borderRadius: 19, paddingHorizontal: 15, color: '#111827', fontSize: 14 },
  primaryButton: { height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', marginTop: 10, shadowColor: '#2563eb', shadowOpacity: 0.24, shadowRadius: 20, elevation: 8 },
  primaryButtonText: { color: '#ffffff', fontWeight: '900', fontSize: 14 },
});
