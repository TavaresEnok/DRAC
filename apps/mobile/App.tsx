import * as FileSystem from 'expo-file-system/legacy';
import * as ScreenOrientation from 'expo-screen-orientation';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { request, normalizeServerUrl, setUnauthorizedHandler } from './src/services/api';
import { fetchBranding } from './src/services/branding';
import { requestCachedStreamUrls } from './src/services/stream-urls-cache';
import { saveToGallery, addClip, listClips, removeClip, type SavedClip } from './src/services/clips';
import { cleanApiUrl, clearStoredSession, loadStoredSession, saveStoredSession } from './src/services/sessionStore';
import { registerForPush, subscribeToNotificationTaps, unregisterFromPush } from './src/services/push';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { useAlarms } from './src/hooks/useAlarms';
import { useLiveDetections } from './src/hooks/useLiveDetections';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { LibraryProvider } from './src/state/LibraryProvider';
import type { ActivePlayback, Camera, Direction, Recording, Session, StreamUrls, Tab, User } from './src/types';

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <LibraryProvider>
            <AppInner />
          </LibraryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function AppInner() {
  const { theme, applyBranding } = useTheme();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
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
  // URL HLS de MÁXIMA QUALIDADE (passthrough H.265, sem transcode) da câmera ao
  // vivo aberta. Buscada sob demanda quando o usuário liga o modo HD.
  const [hdUrl, setHdUrl] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activePlayback, setActivePlayback] = useState<ActivePlayback | null>(null);
  const [ptzActive, setPtzActive] = useState<Direction | null>(null);
  const [ptzFeedback, setPtzFeedback] = useState<string | null>(null);
  const [recordingActive, setRecordingActive] = useState(false);
  // Id do clipe em gravação no servidor (gravação "no celular": o servidor grava
  // o trecho EXATO start→stop e o app baixa o arquivo ao parar).
  const [clipId, setClipId] = useState<string | null>(null);
  // "Minhas gravações" — índice local dos clipes gravados pelo app.
  const [savedClips, setSavedClips] = useState<SavedClip[]>([]);
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
    // NÃO expor o perfil do usuário (ex.: "somente visualização") — é informação
    // interna que o cliente/grupo não deve ver no app. As permissões continuam
    // valendo silenciosamente (gravação/PTZ bloqueados quando for o caso).
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

  // Push de alarmes + sessão expirada. Ao autenticar: registra o handler de 401
  // (logout gracioso quando o token morre) e o aparelho para push; ao tocar na
  // notificação, abre Alarmes e recarrega. Falha de push nunca quebra o app.
  useEffect(() => {
    if (!session) return;
    setUnauthorizedHandler(() => { void logout(); });
    void registerForPush(session.apiUrl, session.token);
    const unsubscribe = subscribeToNotificationTaps(() => {
      setTab('alarmes');
      void reloadAlarms();
    });
    return () => {
      setUnauthorizedHandler(null);
      unsubscribe();
    };
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

  // Ao trocar/sair do ao vivo, zera indicador de gravação e o modo HD (a URL de
  // máxima qualidade é por câmera; não vaza entre telas).
  useEffect(() => {
    setHdUrl(null);
    if (!liveCamera) { setRecordingActive(false); setClipId(null); }
  }, [liveCamera?.id]);

  // Carrega "Minhas gravações" (índice local) ao iniciar.
  useEffect(() => { void listClips().then(setSavedClips); }, []);

  // Máxima qualidade: busca o HLS passthrough (H.265) sob demanda.
  const loadHdStream = async (cameraId: string) => {
    if (!session) return;
    try {
      const data = await requestCachedStreamUrls<StreamUrls>(session.apiUrl, cameraId, session.token, undefined, 'original');
      const hls = normalizeServerUrl(data.protocols?.hlsUrl, session.apiUrl);
      if (!hls) throw new Error('sem HLS');
      setHdUrl(hls);
    } catch {
      setHdUrl(null);
      Alert.alert('Máxima qualidade', 'Não foi possível abrir a máxima qualidade desta câmera agora.');
    }
  };

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
    if (session) await unregisterFromPush(session.apiUrl, session.token);
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
      // Posters para a grade inteira (barato: só token + 1 frame com cache).
      void loadAllPosters(data);
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
      // Poster montado a partir do session.apiUrl (alcançável pelo celular), não
      // do host que a API devolve (pode ser interno do Docker atrás do nginx).
      const posterUrl = data.streamToken
        ? `${session.apiUrl.replace(/\/+$/, '')}/camera-stream/${encodeURIComponent(cameraId)}/poster?token=${encodeURIComponent(data.streamToken)}&v=${Date.now()}`
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

  // Snapshot (poster) em TODOS os tiles, não só nos que abrem o stream. Usa o
  // endpoint em lote /camera-stream/poster-tokens (só emite token, NÃO inicia
  // restream) e publica os posters em lotes escalonados para não disparar muitos
  // frames ffmpeg de uma vez no servidor. Best-effort: falha = tiles com gradiente.
  const loadAllPosters = async (cams: Camera[]) => {
    if (!session || cams.length === 0) return;
    try {
      const { items } = await request<{ items: { cameraId: string; streamToken: string }[] }>(
        session.apiUrl,
        '/camera-stream/poster-tokens',
        session.token,
        { method: 'POST', body: JSON.stringify({ cameraIds: cams.map((c) => c.id) }) },
      );
      // Monta a URL do poster a partir do session.apiUrl (SEMPRE alcançável pelo
      // celular). NÃO usa o host que a API devolve — atrás do nginx/Docker ele
      // pode vir interno (ex.: vms-api:3000), que o celular não acessa → tile preto.
      const apiBase = session.apiUrl.replace(/\/+$/, '');
      const CHUNK = 6;
      for (let i = 0; i < items.length; i += CHUNK) {
        const slice = items.slice(i, i + CHUNK);
        setStreamPosters((current) => {
          const next = { ...current };
          for (const it of slice) {
            next[it.cameraId] = `${apiBase}/camera-stream/${encodeURIComponent(it.cameraId)}/poster?token=${encodeURIComponent(it.streamToken)}&v=${Date.now()}`;
          }
          return next;
        });
        if (i + CHUNK < items.length) await new Promise((resolve) => setTimeout(resolve, 120));
      }
    } catch {
      // sem posters: os tiles caem no gradiente placeholder.
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
    // Mensagem SEMPRE limpa (nunca o erro técnico cru): o PTZ falha tanto com
    // HTTP 200 { status:'error' } (câmera recusa) quanto lançando exceção
    // (ONVIF indisponível). Nos dois casos o usuário só precisa saber isto:
    const ptzFail = () => {
      setPtzFeedback(null);
      Alert.alert('PTZ', 'Não foi possível movimentar. Esta câmera pode não ter suporte a PTZ.');
    };
    try {
      const data = await request<{ status?: string; message?: string }>(
        session.apiUrl,
        `/ptz/${target.id}/move`,
        session.token,
        { method: 'POST', body: JSON.stringify({ action: 'step', direction, durationMs: 450, speed: 5 }) },
      );
      if (data?.status === 'error') { ptzFail(); return; }
      setTimeout(() => setPtzFeedback(null), 650);
    } catch {
      ptzFail();
    } finally {
      setTimeout(() => setPtzActive(null), 220);
    }
  };

  // Botão Gravar (SÓ celular): grava no servidor o trecho EXATO start→stop e,
  // ao parar, baixa o arquivo pro aparelho (galeria/arquivos). Sem opção de
  // "gravar no servidor" — o app é dedicado à gravação no celular.
  const toggleRecording = async (camera: Camera) => {
    // Clipe no celular = salvar o que o usuário JÁ está vendo (como a Foto).
    // Não depende de canRecord (permissão de gravação do NVR) — senão o botão
    // fica morto para usuários VIEWER dos clientes.
    if (!session) return;
    if (recordingActive) {
      await stopClip(camera);
    } else {
      await startClip(camera);
    }
  };

  const startClip = async (camera: Camera) => {
    if (!session) return;
    setRecordingActive(true); // otimista
    try {
      const data = await request<{ clipId: string }>(
        session.apiUrl,
        `/camera-stream/${camera.id}/clip/start`,
        session.token,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setClipId(data.clipId);
    } catch (error) {
      setRecordingActive(false);
      setClipId(null);
      Alert.alert('Gravação', error instanceof Error ? error.message : 'Não foi possível iniciar a gravação.');
    }
  };

  const stopClip = async (camera: Camera) => {
    if (!session) return;
    const id = clipId;
    setRecordingActive(false);
    setClipId(null);
    if (!id) return;
    try {
      await request(session.apiUrl, `/camera-stream/clip/${id}/stop`, session.token, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      // Baixa o arquivo do clipe pro celular (compartilhar → salvar em galeria/arquivos).
      const target = `${FileSystem.documentDirectory}clip-${camera.id}-${Date.now()}.mp4`;
      const url = `${session.apiUrl.replace(/\/+$/, '')}/camera-stream/clip/${encodeURIComponent(id)}/download`;
      const result = await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (result.status && result.status >= 400) throw new Error('Falha ao baixar o clipe.');
      // Salva DIRETO na galeria (sem folha de compartilhamento) + registra em
      // "Minhas gravações". O arquivo local (documentDirectory) fica p/ tocar in-app.
      const savedToGallery = await saveToGallery(result.uri);
      const next = await addClip({
        id: id,
        cameraId: camera.id,
        cameraName: camera.name,
        uri: result.uri,
        createdAt: new Date().toISOString(),
      });
      setSavedClips(next);
      Alert.alert('Gravação salva', savedToGallery
        ? 'Clipe salvo na galeria e em "Minhas gravações".'
        : 'Clipe salvo em "Minhas gravações". (Permissão de galeria negada — dá pra ver o vídeo aqui no app.)');
    } catch (error) {
      Alert.alert('Gravação', error instanceof Error ? error.message : 'Não foi possível salvar o clipe.');
    }
  };

  // Reproduz um clipe local ("Minhas gravações") no mesmo player, sem servidor.
  const playLocalClip = (clip: SavedClip) => {
    setActivePlayback({
      recording: { id: clip.id, cameraId: clip.cameraId, startedAt: clip.createdAt },
      url: clip.uri,
    });
  };

  const deleteLocalClip = async (clip: SavedClip) => {
    try { await FileSystem.deleteAsync(clip.uri, { idempotent: true }); } catch { /* já pode não existir */ }
    setSavedClips(await removeClip(clip.id));
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
      const ok = await saveToGallery(result.uri);
      Alert.alert('Download', ok ? 'Gravação salva na galeria.' : 'Não foi possível salvar (permissão de galeria negada).');
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
      const ok = await saveToGallery(result.uri);
      Alert.alert('Foto', ok ? 'Foto salva na galeria.' : 'Não foi possível salvar (permissão de galeria negada).');
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
        <StatusBar style="light" />
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
          hdUrl={hdUrl}
          onRequestHd={() => loadHdStream(live.id)}
          onExitHd={() => setHdUrl(null)}
          detections={liveDetections}
          ptzActive={ptzActive}
          ptzFeedback={ptzFeedback}
          recordings={recordings}
          myRecordings={savedClips.filter((c) => c.cameraId === live.id)}
          onPlayLocal={playLocalClip}
          onDeleteLocal={deleteLocalClip}
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
        {/* Menu inferior também na câmera aberta — tocar numa aba sai do vídeo e
            vai pra ela. Escondido em paisagem (vídeo em tela cheia usa a área). */}
        {winWidth <= winHeight ? (
          <BottomTabs
            active={tab}
            alarmCount={openAlarmCount}
            onChange={(next) => { setActivePlayback(null); setLiveCamera(null); setTab(next); }}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar style="light" />
      {/* Fundo em GRADIENTE quando o branding define 2 cores (bg != bg2); senão
          o backgroundColor sólido do SafeAreaView aparece. As telas são
          transparentes, então o gradiente é visível atrás delas. */}
      {theme.bg2 !== theme.bg ? (
        <LinearGradient colors={[theme.bg, theme.bg2]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      ) : null}
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
