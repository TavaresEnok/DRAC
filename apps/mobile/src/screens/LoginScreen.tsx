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
    <LinearGradient colors={['#020617', '#0f172a', '#064e3b']} style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <View style={styles.logoMark}>
            <View style={styles.logoLens} />
          </View>
          <Text style={styles.brand}>Drac</Text>
          <Text style={styles.title}>Central de cameras no bolso</Text>
          <Text style={styles.subtitle}>Live, PTZ, playback, alarme e gravacao com acesso filtrado por grupo.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Servidor</Text>
          <TextInput value={apiUrl} onChangeText={onApiUrlChange} autoCapitalize="none" style={styles.input} placeholder="API URL" placeholderTextColor="#8d877b" />
          <Text style={styles.label}>E-mail</Text>
          <TextInput value={email} onChangeText={onEmailChange} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholder="admin@local.dev" placeholderTextColor="#8d877b" />
          <Text style={styles.label}>Senha</Text>
          <TextInput value={password} onChangeText={onPasswordChange} secureTextEntry style={styles.input} placeholder="Sua senha" placeholderTextColor="#8d877b" />
          <Pressable disabled={loading} onPress={onSubmit} style={styles.primaryButton}>
            {loading ? <ActivityIndicator color="#f7f3ea" /> : <Text style={styles.primaryButtonText}>Entrar com seguranca</Text>}
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
  logoMark: { width: 80, height: 80, borderRadius: 30, backgroundColor: 'rgba(15,23,42,0.92)', alignItems: 'center', justifyContent: 'center', shadowColor: '#34d399', shadowOpacity: 0.32, shadowRadius: 28, elevation: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  logoLens: { width: 36, height: 36, borderRadius: 18, borderWidth: 8, borderColor: '#34d399', backgroundColor: '#020617' },
  brand: { color: '#34d399', fontSize: 16, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase', marginTop: 8 },
  title: { color: '#f8fafc', fontSize: 36, lineHeight: 40, fontWeight: '900', maxWidth: 340 },
  subtitle: { color: '#94a3b8', fontSize: 15, lineHeight: 22, maxWidth: 350 },
  card: { backgroundColor: 'rgba(15,23,42,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 32, padding: 18, gap: 8, shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 30, elevation: 16 },
  label: { color: '#64748b', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, marginLeft: 2, marginTop: 4 },
  input: { height: 54, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: 'rgba(2,6,23,0.72)', borderRadius: 19, paddingHorizontal: 15, color: '#f8fafc', fontSize: 14 },
  primaryButton: { height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10b981', marginTop: 10, shadowColor: '#34d399', shadowOpacity: 0.28, shadowRadius: 20, elevation: 8 },
  primaryButtonText: { color: '#02130f', fontWeight: '900', fontSize: 14 },
});
