/**
 * App raiz do mockup DRAC Mobile (UI).
 * Padrão de navegação por estado (igual ao apps/mobile/App.tsx atual): sem react-navigation.
 *
 * Estrutura:
 *   LoginScreen  →  (após login) tabs Central / Mosaico / Reprodução / Alarmes / Ajustes
 *   LiveScreen   →  aberta a partir de uma câmera; ocupa a tela inteira e esconde a BottomTabs.
 */
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';

import { BottomTabs } from './src/components/BottomTabs';
import { AlarmsScreen } from './src/screens/AlarmsScreen';
import { CentralScreen } from './src/screens/CentralScreen';
import { LiveScreen } from './src/screens/LiveScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MosaicScreen } from './src/screens/MosaicScreen';
import { PlaybackScreen } from './src/screens/PlaybackScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { LibraryProvider } from './src/state/LibraryProvider';
import type { Camera, Tab } from './src/types';

function Shell() {
  const { theme, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const [loggedIn, setLoggedIn] = useState(false);
  const [tab, setTab] = useState<Tab>('central');
  const [liveCamera, setLiveCamera] = useState<Camera | null>(null);

  if (!loggedIn) {
    return (
      <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <LoginScreen onSubmit={() => setLoggedIn(true)} />
      </View>
    );
  }

  // Live ocupa a tela inteira (sem tabs)
  if (liveCamera) {
    return (
      <View style={[styles.root, { backgroundColor: '#070809', paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <LiveScreen camera={liveCamera} onBack={() => setLiveCamera(null)} onPtz={() => {}} />
      </View>
    );
  }

  const openCamera = (camera: Camera) => setLiveCamera(camera);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {tab === 'central' && <CentralScreen onOpenCamera={openCamera} />}
        {tab === 'mosaico' && <MosaicScreen onOpenCamera={openCamera} />}
        {tab === 'reproducao' && <PlaybackScreen />}
        {tab === 'alarmes' && <AlarmsScreen />}
        {tab === 'ajustes' && <SettingsScreen onLogout={() => setLoggedIn(false)} />}
      </View>
      <BottomTabs active={tab} onChange={setTab} alarmCount={3} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      {/* initialMode pode vir da preferência do SO via useColorScheme() */}
      <ThemeProvider initialMode="dark">
        <LibraryProvider>
          <Shell />
        </LibraryProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
