import { Pressable, Text, View } from 'react-native';
import { SvgIcon } from '../components/SvgIcon';
import { styles } from '../styles/appStyles';
import type { Session } from '../types';

interface ProfileScreenProps {
  session: Session;
  onLogout: () => void;
}

const settingsItems = ['Gerenciar Dispositivos', 'Armazenamento em Nuvem', 'Notificações', 'Ajuda e Suporte'];

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
      <View style={styles.settingsList}>
        {settingsItems.map((item) => (
          <View key={item} style={[styles.settingsRow, styles.settingsRowDisabled]}>
            <Text style={styles.settingsRowText}>{item}</Text>
            <Text style={styles.settingsSoonText}>Em breve</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={onLogout} style={styles.logoutButton}><Text style={styles.logoutText}>Sair do app</Text></Pressable>
    </View>
  );
}
