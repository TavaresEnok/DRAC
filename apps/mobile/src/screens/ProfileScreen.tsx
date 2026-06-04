import { Pressable, Text, View } from 'react-native';
import { SvgIcon } from '../components/SvgIcon';
import { styles } from '../styles/appStyles';
import type { Session } from '../types';

interface ProfileScreenProps {
  session: Session;
  onLogout: () => void;
}

export function ProfileScreen({ session, onLogout }: ProfileScreenProps) {
  return (
    <View style={styles.page}>
      <Text style={styles.profileScreenTitle}>Ajustes</Text>
      <View style={styles.profileSimpleCard}>
        <View style={styles.profileSimpleAvatar}>
          <SvgIcon name="user" size={28} color="#94a3b8" />
        </View>
        <View>
          <Text style={styles.profileSimpleName}>{session.user.name}</Text>
          <Text style={styles.profileSimplePlan}>{session.user.role}</Text>
        </View>
      </View>
      <View style={styles.profileSimpleCard}>
        <SvgIcon name="settings" size={22} color="#64748b" />
        <View style={styles.profileSimpleInfo}>
          <Text style={styles.settingsRowText}>Acesso sincronizado com o servidor</Text>
          <Text style={styles.profileSimplePlan}>Permissões, câmeras e segurança são controladas pelo DRAC local.</Text>
        </View>
      </View>
      <Pressable onPress={onLogout} style={styles.logoutButton}><Text style={styles.logoutText}>Sair do app</Text></Pressable>
    </View>
  );
}
