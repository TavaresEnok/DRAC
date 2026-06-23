import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BOTTOM_SAFE } from '../config';
import type { Tab } from '../types';
import { SvgIcon } from './SvgIcon';

interface BottomTabsProps {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
  alarmCount?: number;
}

const tabs: Array<{ id: Tab; label: string; icon: 'home' | 'play' | 'grid' | 'user' | 'bell' }> = [
  { id: 'dashboard', icon: 'home', label: 'Casa' },
  { id: 'alarms', icon: 'bell', label: 'Alarmes' },
  { id: 'grid', icon: 'grid', label: 'Mosaico' },
  { id: 'playback', icon: 'play', label: 'Reprodução' },
  { id: 'profile', icon: 'user', label: 'Perfil' },
];

export function BottomTabs({ activeTab, onChange, alarmCount = 0 }: BottomTabsProps) {
  return (
    <View style={styles.tabs}>
      {tabs.map((item) => {
        const active = activeTab === item.id;
        const showBadge = item.id === 'alarms' && alarmCount > 0;
        return (
          <Pressable key={item.id} onPress={() => onChange(item.id)} style={styles.tab}>
            <View>
              <SvgIcon name={item.icon} size={22} color={active ? '#2563eb' : '#9ca3af'} />
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{alarmCount > 9 ? '9+' : alarmCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { position: 'absolute', left: 0, right: 0, bottom: 0, height: BOTTOM_SAFE + 84, backgroundColor: 'rgba(255,255,255,0.96)', borderTopWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, paddingTop: 10, paddingBottom: BOTTOM_SAFE + 10, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', gap: 4, shadowColor: '#111827', shadowOpacity: 0.14, shadowRadius: 28, elevation: 24 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 4 },
  tabText: { color: '#9ca3af', fontSize: 9, fontWeight: '900', letterSpacing: 0.35 },
  tabTextActive: { color: '#2563eb' },
  badge: { position: 'absolute', top: -5, right: -9, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#ffffff' },
  badgeText: { color: '#ffffff', fontSize: 9, fontWeight: '900' },
});
