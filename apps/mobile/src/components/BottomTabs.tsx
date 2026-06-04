import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BOTTOM_SAFE } from '../config';
import type { Tab } from '../types';
import { SvgIcon } from './SvgIcon';

interface BottomTabsProps {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}

const tabs: Array<{ id: Tab; label: string; icon: 'home' | 'play' | 'grid' | 'user' }> = [
  { id: 'dashboard', icon: 'home', label: 'Casa' },
  { id: 'playback', icon: 'play', label: 'Reprodução' },
  { id: 'grid', icon: 'grid', label: 'Mosaico' },
  { id: 'profile', icon: 'user', label: 'Perfil' },
];

export function BottomTabs({ activeTab, onChange }: BottomTabsProps) {
  return (
    <View style={styles.tabs}>
      {tabs.map((item) => {
        const active = activeTab === item.id;
        return (
          <Pressable key={item.id} onPress={() => onChange(item.id)} style={styles.tab}>
            <SvgIcon name={item.icon} size={22} color={active ? '#2563eb' : '#9ca3af'} />
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
});
