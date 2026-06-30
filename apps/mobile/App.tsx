import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DEFAULT_API_URL, TOP_SAFE } from './src/config';
import { BottomTabs } from './src/components/BottomTabs';
import { AlarmsScreen } from './src/screens/AlarmsScreen';
import { CentralScreen } from './src/screens/CentralScreen';
import { LiveScreen } from './src/screens/LiveScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MosaicScreen } from './src/screens/MosaicScreen';
import { PlaybackScreen } from './src/screens/PlaybackScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { request, normalizeServerUrl } from './src/services/api';
import { fetchBranding } from './src/services/branding';
import { requestCachedStreamUrls } from './src/services/stream-urls-cache';
import { cleanApiUrl, clearStoredSession, loadStoredSession, saveStoredSession } from './src/services/sessionStore';
import { useAlarms } from './src/hooks/useAlarms';
import { useLiveDetections } from './src/hooks/useLiveDetections';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { LibraryProvider } from './src/state/LibraryProvider';
import type { ActivePlayback, Camera, Direction, Recording, Session, StreamUrls, Tab, User } from './src/types';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LibraryProvider>
          <AppInner />
        </LibraryProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppInner() {
  const { theme, mode, applyBranding } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('central');
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [liveCamera, setLiveCamera] = useState<Camera | null>(null);
  const [streamUrls, setStreamUrls] = useState<Record<string, string | null>>({});
  const [streamWhep, setStreamWhep] = useState<Record<string, string | null>>({});
  const [streamPosters, setStreamPosters] = useState<Record<string, string | null>>({});
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activePlayback, setActivePlayback] = useState<ActivePlayback | null>(null);
  const [ptzActive, setPtzActive] = useState<Direction | null>(null);
  const [ptzFeedback, setPtzFeedback] = useState<string | null>(null);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingDate, setRecordingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const previewLimit = 8;
  const selectedCamera = cameras.find((camera) => camera.id === selectedCameraId) ?? cameras[0] ?? null;

  const { alarms, openAlarmCount, reload: reloadAlarms, ack: ackAlarm, resolve: resolveAlarm } = useAlarms(session);
  const liveDetections = useLiveDetections(session, liveCamera != null, liveCamera?.id ?? null);

  const operationalMessages = (() => {
    const messages: string[] = [];
    const offline = cameras.filter((camera) => camera.status !== 'ONLINE').length;
    if (lastSyncError) messages.push(lastSyncError);
    if (offline > 0) messages.push(`${offline} câmera(s) offline ou sem comunicação.`);
    if (session?.user.role === 'VIEWER') messages.push('Seu perfil é somente visualização. Gravação e PTZ podem estar bloqueados.');
    return messages.slice(0, 3);
  })();

  // Busca a marca (logo/nome/cores) do servidor e aplica no tema. Silencioso:
  // se falhar (offline, sem branding configurado), mantém o tema padrão.
  const loadBranding = (url: string) => {
    if (!url) return;
    fetchBranding(url)
      .then(applyBranding)
      .catch(() => undefined);
  };

  useEffect(() => {
    // Em builds white-label o servidor já vem embutido: aplica a marca já no login.
    if (DEFAULT_API_URL) loadBranding(DEFAULT_API_URL);

    loadStoredSession()
      .then((raw) => {
        if (!raw) return;
        const stored = JSON.parse(raw) as Session;
        const normalized = { ...stored, apiUrl: cleanApiUrl(stored.apiUrl) };
        if (normalized.apiUrl !== stored.apiUrl) {
          void saveStoredSession(normalized);
        }
        setSession(normalized);
        setApiUrl(normalized.apiUrl);
        loadBranding(normalized.apiUrl);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (session) void loadAll();
  }, [session?.token]);

  // Orientação: o app é retrato; SÓ a tela ao vivo libera paisagem (gira ao deitar
  // o aparelho) e volta a travar em retrato ao sair.
  useEffect(() => {
    if (liveCamera) {
      ScreenOrientation.unlockAsync().catch(() => undefined);
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    }
  }, [liveCamera]);

  useEffect(() => {
    if (selectedCamera && session) {
      void loadStream(selectedCamera.id);
      void loadRecordings(selectedCamera.id, recordingDate);
    }
  }, [selectedCamera?.id, session?.token, recordingDate]);

  // Ao abrir o ao vivo, busca o estado real de gravação e revalida a cada 15s.
  useEffect(() => {
    if (!liveCamera || !session) {
      setRecordingActive(false);
      return;
    }
    void refreshRecordingStatus(liveCamera.id);
    const timer = setInterval(() => void refreshRecordingStatus(liveCamera.id), 15000);
    return () => clearInterval(timer);
  }, [liveCamera?.id, session?.token]);

  const login = async () => {
    setLoading(true);
    try {
      const nextApiUrl = cleanApiUrl(apiUrl);
      if (!nextApiUrl) throw new Error('Informe a URL da API no campo "Servidor".');
      const data = await request<{ accessToken: string; user: User }>(nextApiUrl, '/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const nextSession = { apiUrl: nextApiUrl, token: data.accessToken, user: data.user };
      await saveStoredSession(nextSession);
      setSession(nextSession);
      setPassword('');
      // Aplica a marca da instalação que acabou de logar (caso o servidor não
      // estivesse embutido no APK, ex.: app DRAC padrão apontando p/ um cliente).
      loadBranding(nextApiUrl);
    } catch (error) {
      Alert.alert('Falha no login', error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    const targetEmail = email.trim();
    if (!targetEmail) {
      Alert.alert('Esqueci minha senha', 'Informe o e-mail da sua conta no campo acima e toque novamente.');
      return;
    }
    const nextApiUrl = cleanApiUrl(apiUrl);
    if (!nextApiUrl) {
      Alert.alert('Esqueci minha senha', 'Informe a URL do servidor antes de continuar.');
      return;
    }
    try {
      await request(nextApiUrl, '/auth/forgot-password', undefined, {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail }),
      });
    } catch {
      // O backend responde igual existindo ou não a conta (evita enumeração de e-mails).
    }
    Alert.alert(
      'Verifique seu e-mail',
      `Se houver uma conta para ${targetEmail}, enviamos um link para redefinir a senha. Abra o link no navegador para concluir.`,
    );
  };

  const logout = async () => {
    await clearStoredSession();
    setSession(null);
    setCameras([]);
    setRecordings([]);
    setStreamUrls({});
    setLiveCamera(null);
    setTab('central');
  };

  const loadAll = async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      const data = await request<Camera[]>(session.apiUrl, '/cameras', session.token);
      setCameras(data);
      setLastSyncError(null);
      setSelectedCameraId((current) => current ?? data[0]?.id ?? null);
      void reloadAlarms();
      void Promise.all(data.slice(0, previewLimit).map((camera) => loadStream(camera.id)));
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const message = error instanceof Error ? error.message : 'Não foi possível carregar câmeras.';
      const isAuthError = status === 401 || /\b401\b|unauthorized|não autorizado/i.test(message);
      setLastSyncError(isAuthError ? 'Sessão expirada. Entre novamente.' : `Servidor indisponível: ${message}`);
      if (isAuthError) {
        await logout();
        Alert.alert('Sessão expirada', 'Sua sessão expirou. Entre novamente para continuar.');
      } else {
        Alert.alert('Falha ao carregar', message);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const loadStream = async (cameraId: string) => {
    if (!session) return;
    try {
      const data = await requestCachedStreamUrls<StreamUrls>(session.apiUrl, cameraId, session.token);
      const hlsUrl = normalizeServerUrl(data.protocols?.hlsUrl, session.apiUrl);
      const whepRaw =
        data.protocols?.whepUrl
        ?? (data.protocols?.webrtcUrl ? `${data.protocols.webrtcUrl.replace(/\/+$/, '')}/whep` : null);
      const whepUrl = normalizeServerUrl(whepRaw, session.apiUrl);
      const posterBaseUrl = normalizeServerUrl(data.protocols?.posterUrl, session.apiUrl);
      const posterUrl = posterBaseUrl && data.streamToken
        ? `${posterBaseUrl}${posterBaseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(data.streamToken)}&v=${Date.now()}`
        : null;
      setStreamUrls((current) => ({ ...current, [cameraId]: hlsUrl }));
      setStreamWhep((current) => ({ ...current, [cameraId]: whepUrl }));
      setStreamPosters((current) => ({ ...current, [cameraId]: posterUrl }));
    } catch {
      setStreamUrls((current) => ({ ...current, [cameraId]: null }));
      setStreamWhep((current) => ({ ...current, [cameraId]: null }));
      setStreamPosters((current) => ({ ...current, [cameraId]: null }));
    }
  };

  const loadRecordings = async (cameraId: string, date = recordingDate) => {
    if (!session) return;
    try {
      const data = await request<{ items: Recording[] }>(
        session.apiUrl,
        `/recordings?cameraId=${encodeURIComponent(cameraId)}&date=${date}&limit=80&sort=desc`,
        session.token,
      );
      setRecordings(Array.isArray(data.items) ? data.items : []);
      setActivePlayback(null);
    } catch {
      setRecordings([]);
      setActivePlayback(null);
    }
  };

  const shiftRecordingDate = (days: number) => {
    setRecordingDate((current) => {
      const next = new Date(`${current}T12:00:00`);
      next.setDate(next.getDate() + days);
      const nextKey = next.toISOString().slice(0, 10);
      const todayKey = new Date().toISOString().slice(0, 10);
      return nextKey > todayKey ? todayKey : nextKey;
    });
    setActivePlayback(null);
  };

  const sendPtz = async (direction: Direction) => {
    const target = liveCamera;
    if (!session || !target?.canControl) return;
    setPtzActive(direction);
    setPtzFeedback(direction);
    try {
      await request(session.apiUrl, `/ptz/${target.id}/move`, session.token, {
        method: 'POST',
        body: JSON.stringify({ action: 'step', direction, durationMs: 450, speed: 5 }),
      });
      setTimeout(() => setPtzFeedback(null), 650);
    } catch (error) {
      setPtzFeedback(null);
      Alert.alert('PTZ', error instanceof Error ? error.message : 'Comando não aceito.');
    } finally {
      setTimeout(() => setPtzActive(null), 220);
    }
  };

  // Estado REAL de gravação da câmera (intendedRecording do backend). O botão
  // do ao vivo reflete isso (vermelho = gravando), em vez de só dar um alerta.
  const refreshRecordingStatus = async (cameraId: string) => {
    if (!session) return;
    try {
      const data = await request<{ isRecording?: boolean; intendedRecording?: boolean }>(
        session.apiUrl,
        `/cameras/${cameraId}/recording/status`,
        session.token,
      );
      setRecordingActive(Boolean(data.intendedRecording ?? data.isRecording));
    } catch {
      // mantém o estado atual em caso de falha de rede
    }
  };

  const toggleRecording = async (camera: Camera) => {
    if (!session || !camera.canRecord) return;
    const start = !recordingActive;
    setRecordingActive(start); // otimista; confirma com o status real abaixo
    try {
      await request(session.apiUrl, `/cameras/${camera.id}/recording/${start ? 'start' : 'stop'}`, session.token, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refreshRecordingStatus(camera.id);
      Alert.alert(
        'Gravação',
        start
          ? 'Gravação iniciada. O trecho aparece na linha do tempo quando o segmento fecha.'
          : 'Gravação parada.',
      );
      void loadRecordings(camera.id, recordingDate);
    } catch (error) {
      await refreshRecordingStatus(camera.id); // reverte para o estado real
      Alert.alert('Gravação', error instanceof Error ? error.message : 'Não foi possível alterar a gravação.');
    }
  };

  const openPlayback = async (recording: Recording) => {
    if (!session) return;
    try {
      const data = await request<{ playToken: string }>(session.apiUrl, `/recordings/${recording.id}/play-token`, session.token, { method: 'POST' });
      const url = normalizeServerUrl(`${session.apiUrl}/recordings/${recording.id}/play?token=${encodeURIComponent(data.playToken)}&compatible=1`, session.apiUrl);
      if (!url) throw new Error('URL de reprodução indisponível.');
      setActivePlayback({ recording, url });
    } catch (error) {
      Alert.alert('Reprodução', error instanceof Error ? error.message : 'Não foi possível abrir a gravação.');
    }
  };

  const downloadRecording = async (recording: Recording) => {
    if (!session) return;
    try {
      const target = `${FileSystem.documentDirectory}${recording.id}.mp4`;
      const url = normalizeServerUrl(`${session.apiUrl}/recordings/${recording.id}/download`, session.apiUrl);
      if (!url) throw new Error('URL de download indisponível.');
      const result = await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: 'video/mp4', dialogTitle: 'Compartilhar gravação' });
      } else {
        Alert.alert('Download concluido', result.uri);
      }
    } catch (error) {
      Alert.alert('Download', error instanceof Error ? error.message : 'Não foi possível baixar.');
    }
  };

  const takeSnapshot = async (camera: Camera) => {
    if (!session) return;
    const poster = streamPosters[camera.id];
    if (!poster) {
      Alert.alert('Foto', 'Imagem ainda indisponível. Aguarde a transmissão carregar e tente novamente.');
      return;
    }
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const target = `${FileSystem.documentDirectory}${camera.id}-${stamp}.jpg`;
      // O poster já carrega o token na query — baixa direto, sem header de auth.
      const fresh = `${poster}${poster.includes('?') ? '&' : '?'}snap=${Date.now()}`;
      const result = await FileSystem.downloadAsync(fresh, target);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: 'image/jpeg', dialogTitle: 'Compartilhar foto' });
      } else {
        Alert.alert('Foto salva', result.uri);
      }
    } catch (error) {
      Alert.alert('Foto', error instanceof Error ? error.message : 'Não foi possível capturar a imagem.');
    }
  };

  const openLive = (camera: Camera) => {
    setSelectedCameraId(camera.id);
    setLiveCamera(camera);
  };

  if (!session) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <LoginScreen
          apiUrl={apiUrl}
          email={email}
          password={password}
          loading={loading}
          onApiUrlChange={setApiUrl}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={login}
          onForgotPassword={forgotPassword}
        />
      </SafeAreaView>
    );
  }

  // Ao vivo: overlay em tela cheia, sem BottomTabs.
  if (liveCamera) {
    const live = cameras.find((c) => c.id === liveCamera.id) ?? liveCamera;
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: '#070809' }]}>
        <StatusBar style="light" />
        <LiveScreen
          camera={live}
          topInset={TOP_SAFE}
          streamUrl={streamUrls[live.id] ?? null}
          whepUrl={streamWhep[live.id] ?? null}
          posterUrl={streamPosters[live.id] ?? null}
          detections={liveDetections}
          ptzActive={ptzActive}
          ptzFeedback={ptzFeedback}
          recordings={recordings}
          recordingDate={recordingDate}
          activePlayback={activePlayback}
          recordingActive={recordingActive}
          onBack={() => { setActivePlayback(null); setLiveCamera(null); }}
          onSendPtz={sendPtz}
          onToggleRecording={toggleRecording}
          onSnapshot={takeSnapshot}
          onOpenPlayback={openPlayback}
          onClosePlayback={() => setActivePlayback(null)}
          onDownloadRecording={downloadRecording}
          onPreviousDate={() => shiftRecordingDate(-1)}
          onNextDate={() => shiftRecordingDate(1)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.body, { paddingTop: TOP_SAFE }]}>
        {tab === 'central' && (
          <CentralScreen
            cameras={cameras}
            user={session.user}
            streamPosters={streamPosters}
            operationalMessages={operationalMessages}
            alarmCount={openAlarmCount}
            refreshing={refreshing}
            onRefresh={loadAll}
            onOpenCamera={openLive}
            onOpenAlarms={() => setTab('alarmes')}
          />
        )}

        {tab === 'mosaico' && (
          <MosaicScreen
            cameras={cameras}
            streamPosters={streamPosters}
            refreshing={refreshing}
            onRefresh={loadAll}
            onOpenCamera={openLive}
          />
        )}

        {tab === 'reproducao' && (
          <PlaybackScreen
            cameras={cameras}
            selectedCamera={selectedCamera}
            recordings={recordings}
            activePlayback={activePlayback}
            recordingDate={recordingDate}
            onSelectCamera={(cameraId) => { setSelectedCameraId(cameraId); setActivePlayback(null); void loadRecordings(cameraId, recordingDate); }}
            onOpenPlayback={openPlayback}
            onClosePlayback={() => setActivePlayback(null)}
            onDownloadRecording={downloadRecording}
            onPreviousDate={() => shiftRecordingDate(-1)}
            onNextDate={() => shiftRecordingDate(1)}
          />
        )}

        {tab === 'alarmes' && (
          <AlarmsScreen
            alarms={alarms}
            canManage={session.user.role !== 'VIEWER'}
            refreshing={refreshing}
            onRefresh={() => { void reloadAlarms(); }}
            onAck={ackAlarm}
            onResolve={resolveAlarm}
            onOpenCamera={(cameraId) => {
              const camera = cameras.find((c) => c.id === cameraId);
              if (camera) openLive(camera);
            }}
          />
        )}

        {tab === 'ajustes' && (
          <SettingsScreen user={session.user} apiUrl={session.apiUrl} onLogout={logout} />
        )}
      </View>

      <BottomTabs active={tab} onChange={setTab} alarmCount={openAlarmCount} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
});
