import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const DEFAULT_API_URL = 'http://168.194.13.70:3000';
const SESSION_KEY = 'drac.mobile.session.v1';
const GRID_OPTIONS = [1, 2, 4] as const;

type GridSize = (typeof GRID_OPTIONS)[number];
type Direction = 'Up' | 'Down' | 'Left' | 'Right' | 'ZoomIn' | 'ZoomOut';
type Tab = 'dashboard' | 'live' | 'grid' | 'playback' | 'profile';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
};

type Camera = {
  id: string;
  name: string;
  ip: string;
  status: string;
  group?: { id: string; name: string } | null;
  canView?: boolean;
  canControl?: boolean;
  canRecord?: boolean;
  ptzCapable?: boolean;
  preferredLiveProtocol?: string;
  detectedWidth?: number | null;
  detectedHeight?: number | null;
  detectedFps?: number | null;
};

type Recording = {
  id: string;
  cameraId: string;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  sizeBytes?: string | number | null;
  fileUsable?: boolean;
  fileExists?: boolean;
};

type StreamUrls = {
  streamToken?: string;
  protocols?: {
    hlsUrl?: string | null;
    webrtcUrl?: string | null;
    flvUrl?: string | null;
    posterUrl?: string | null;
  };
};

type RelayDiscovery = {
  ok: boolean;
  relays?: Array<{ token: string }>;
  relayCount?: number;
  triggerable?: boolean;
  message?: string;
};

type Session = {
  apiUrl: string;
  token: string;
  user: User;
};

function cleanApiUrl(value: string) {
  const next = value.trim().replace(/\/+$/, '');
  if (!next) return DEFAULT_API_URL;
  return next.replace(/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i, '//168.194.13.70:3000');
}

function normalizeServerUrl(value: string | null | undefined, apiUrl: string) {
  if (!value) return null;
  const api = new URL(apiUrl);
  return value.replace(/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i, `//${api.host}`);
}

function formatTime(value?: string | null) {
  if (!value) return '--:--';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return 'em andamento';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}m ${rest}s`;
}

function formatBytes(value?: string | number | null) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '--';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatResolution(camera?: Camera | null) {
  if (!camera?.detectedWidth || !camera.detectedHeight) return 'Resolucao pendente';
  const fps = camera.detectedFps ? ` @ ${camera.detectedFps} FPS` : '';
  return `${camera.detectedWidth}x${camera.detectedHeight}${fps}`;
}

function isOnline(camera: Camera) {
  return camera.status?.toUpperCase() === 'ONLINE';
}

async function request<T>(apiUrl: string, path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message ?? `HTTP ${response.status}`);
  }
  return data as T;
}

function LiveVideo({ uri, posterUri }: { uri: string | null; posterUri?: string | null }) {
  const player = useVideoPlayer(uri ? { uri } : null, (instance) => {
    instance.loop = true;
    if (uri) instance.play();
  });

  if (!uri) {
    return (
      <View style={[styles.video, styles.videoEmpty]}>
        {posterUri ? <Image source={{ uri: posterUri }} style={styles.videoPoster} /> : null}
        <Text style={styles.videoEmptyTitle}>Stream indisponivel</Text>
        <Text style={styles.videoEmptyText}>Atualize ou abra a camera novamente.</Text>
      </View>
    );
  }

  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ActionPill({
  label,
  tone = 'neutral',
  disabled,
  onPress,
}: {
  label: string;
  tone?: 'neutral' | 'danger' | 'success';
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionPill, styles[`actionPill_${tone}`], disabled && styles.disabled]}
    >
      <Text style={[styles.actionPillText, styles[`actionPillText_${tone}`]]}>{label}</Text>
    </Pressable>
  );
}


function PtzButton({
  label,
  direction,
  disabled,
  active,
  onPress,
  style,
}: {
  label: string;
  direction: Direction;
  disabled?: boolean;
  active?: boolean;
  onPress: (direction: Direction) => void;
  style?: object;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onPress(direction)}
      style={({ pressed }) => [styles.ptzRoundButton, style, (pressed || active) && styles.ptzRoundButtonActive, disabled && styles.disabled]}
    >
      {({ pressed }) => <Text style={[styles.ptzRoundText, (pressed || active) && styles.ptzRoundTextActive]}>{label}</Text>}
    </Pressable>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [gridSize, setGridSize] = useState<GridSize>(2);
  const [streamUrls, setStreamUrls] = useState<Record<string, string | null>>({});
  const [streamPosters, setStreamPosters] = useState<Record<string, string | null>>({});
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [relays, setRelays] = useState<Record<string, RelayDiscovery>>({});
  const [ptzActive, setPtzActive] = useState<Direction | null>(null);
  const [ptzFeedback, setPtzFeedback] = useState<string | null>(null);
  const selectedCamera = cameras.find((camera) => camera.id === selectedCameraId) ?? cameras[0] ?? null;

  const visibleGridCameras = useMemo(() => cameras.slice(0, gridSize), [cameras, gridSize]);
  const groupedCameras = useMemo(() => {
    const map = new Map<string, Camera[]>();
    for (const camera of cameras) {
      const groupName = camera.group?.name ?? 'Sem grupo';
      map.set(groupName, [...(map.get(groupName) ?? []), camera]);
    }
    return Array.from(map.entries());
  }, [cameras]);
  const onlineCount = cameras.filter(isOnline).length;
  const recordableCount = cameras.filter((camera) => camera.canRecord).length;
  const controllableCount = cameras.filter((camera) => camera.canControl).length;

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then((raw) => {
        if (!raw) return;
        const stored = JSON.parse(raw) as Session;
        const normalized = { ...stored, apiUrl: cleanApiUrl(stored.apiUrl) };
        if (normalized.apiUrl !== stored.apiUrl) {
          void AsyncStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
        }
        setSession(normalized);
        setApiUrl(normalized.apiUrl);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (session) void loadAll();
  }, [session?.token]);

  useEffect(() => {
    if (selectedCamera && session) {
      void loadStream(selectedCamera.id);
      void loadRecordings(selectedCamera.id);
      void loadRelaySupport(selectedCamera.id);
    }
  }, [selectedCamera?.id, session?.token]);

  const login = async () => {
    setLoading(true);
    try {
      const nextApiUrl = cleanApiUrl(apiUrl);
      const data = await request<{ accessToken: string; user: User }>(nextApiUrl, '/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const nextSession = { apiUrl: nextApiUrl, token: data.accessToken, user: data.user };
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setPassword('');
    } catch (error) {
      Alert.alert('Falha no login', error instanceof Error ? error.message : 'Nao foi possivel entrar.');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setSession(null);
    setCameras([]);
    setRecordings([]);
    setStreamUrls({});
  };

  const loadAll = async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      const data = await request<Camera[]>(session.apiUrl, '/cameras', session.token);
      setCameras(data);
      setSelectedCameraId((current) => current ?? data[0]?.id ?? null);
      void Promise.all(data.slice(0, 8).map((camera) => loadStream(camera.id)));
    } catch (error) {
      Alert.alert('Falha ao carregar', error instanceof Error ? error.message : 'Nao foi possivel carregar cameras.');
    } finally {
      setRefreshing(false);
    }
  };

  const loadStream = async (cameraId: string) => {
    if (!session) return;
    try {
      const data = await request<StreamUrls>(session.apiUrl, `/camera-stream/${cameraId}/urls`, session.token);
      const hlsUrl = normalizeServerUrl(data.protocols?.hlsUrl, session.apiUrl);
      const posterBaseUrl = normalizeServerUrl(data.protocols?.posterUrl, session.apiUrl);
      const posterUrl = posterBaseUrl && data.streamToken
        ? `${posterBaseUrl}${posterBaseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(data.streamToken)}&v=${Date.now()}`
        : null;
      setStreamUrls((current) => ({ ...current, [cameraId]: hlsUrl }));
      setStreamPosters((current) => ({ ...current, [cameraId]: posterUrl }));
    } catch {
      setStreamUrls((current) => ({ ...current, [cameraId]: null }));
      setStreamPosters((current) => ({ ...current, [cameraId]: null }));
    }
  };

  const loadRelaySupport = async (cameraId: string) => {
    if (!session) return;
    try {
      const data = await request<RelayDiscovery>(session.apiUrl, `/ptz/${cameraId}/relays`, session.token);
      setRelays((current) => ({ ...current, [cameraId]: data }));
    } catch {
      setRelays((current) => ({ ...current, [cameraId]: { ok: false, relays: [], relayCount: 0, triggerable: false } }));
    }
  };

  const loadRecordings = async (cameraId: string) => {
    if (!session) return;
    const date = new Date().toISOString().slice(0, 10);
    try {
      const data = await request<{ items: Recording[] }>(
        session.apiUrl,
        `/recordings?cameraId=${encodeURIComponent(cameraId)}&date=${date}&limit=80&sort=desc`,
        session.token,
      );
      setRecordings(Array.isArray(data.items) ? data.items : []);
    } catch {
      setRecordings([]);
    }
  };

  const sendPtz = async (direction: Direction) => {
    if (!session || !selectedCamera?.canControl) return;
    setPtzActive(direction);
    setPtzFeedback(direction);
    try {
      await request(session.apiUrl, `/ptz/${selectedCamera.id}/move`, session.token, {
        method: 'POST',
        body: JSON.stringify({ action: 'step', direction, durationMs: 450, speed: 5 }),
      });
      setTimeout(() => setPtzFeedback(null), 650);
    } catch (error) {
      setPtzFeedback(null);
      Alert.alert('PTZ', error instanceof Error ? error.message : 'Comando nao aceito.');
    } finally {
      setTimeout(() => setPtzActive(null), 220);
    }
  };

  const toggleRecording = async (camera: Camera, start: boolean) => {
    if (!session || !camera.canRecord) return;
    try {
      await request(session.apiUrl, `/cameras/${camera.id}/recording/${start ? 'start' : 'stop'}`, session.token, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadAll();
    } catch (error) {
      Alert.alert('Gravacao', error instanceof Error ? error.message : 'Nao foi possivel alterar a gravacao.');
    }
  };

  const triggerRelay = async () => {
    if (!session || !selectedCamera) return;
    const discovery = relays[selectedCamera.id];
    const token = discovery?.relays?.[0]?.token;
    if (!discovery?.triggerable || !token) return;
    try {
      await request(session.apiUrl, `/ptz/${selectedCamera.id}/relays/trigger`, session.token, {
        method: 'POST',
        body: JSON.stringify({ token, durationMs: 1500 }),
      });
      Alert.alert('Alarme', 'Pulso enviado para a camera.');
    } catch (error) {
      Alert.alert('Alarme', error instanceof Error ? error.message : 'Nao foi possivel acionar.');
    }
  };

  const openPlayback = async (recording: Recording) => {
    if (!session) return;
    try {
      const data = await request<{ playToken: string }>(session.apiUrl, `/recordings/${recording.id}/play-token`, session.token, { method: 'POST' });
      const url = normalizeServerUrl(`${session.apiUrl}/recordings/${recording.id}/play?token=${encodeURIComponent(data.playToken)}&compatible=1`, session.apiUrl);
      if (!url) throw new Error('URL de playback indisponivel.');
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Playback', error instanceof Error ? error.message : 'Nao foi possivel abrir a gravacao.');
    }
  };

  const downloadRecording = async (recording: Recording) => {
    if (!session) return;
    try {
      const target = `${FileSystem.documentDirectory}${recording.id}.mp4`;
      const url = normalizeServerUrl(`${session.apiUrl}/recordings/${recording.id}/download`, session.apiUrl);
      if (!url) throw new Error('URL de download indisponivel.');
      const result = await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: 'video/mp4', dialogTitle: 'Compartilhar gravacao' });
      } else {
        Alert.alert('Download concluido', result.uri);
      }
    } catch (error) {
      Alert.alert('Download', error instanceof Error ? error.message : 'Nao foi possivel baixar.');
    }
  };

  if (!session) {
    return (
      <LinearGradient colors={['#f6f3ed', '#ece7dc', '#d7e4d5']} style={styles.loginScreen}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.loginSafe}>
          <View style={styles.loginHero}>
            <View style={styles.logoMark}>
              <View style={styles.logoLens} />
            </View>
            <Text style={styles.loginBrand}>Drac</Text>
            <Text style={styles.loginTitle}>Central de cameras no bolso</Text>
            <Text style={styles.loginSubtitle}>Live, PTZ, playback, alarme e gravacao com acesso filtrado por grupo.</Text>
          </View>

          <View style={styles.loginCard}>
            <Text style={styles.formLabel}>Servidor</Text>
            <TextInput value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" style={styles.input} placeholder="API URL" placeholderTextColor="#8d877b" />
            <Text style={styles.formLabel}>E-mail</Text>
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholder="admin@local.dev" placeholderTextColor="#8d877b" />
            <Text style={styles.formLabel}>Senha</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry style={styles.input} placeholder="Sua senha" placeholderTextColor="#8d877b" />
            <Pressable disabled={loading} onPress={login} style={styles.primaryButton}>
              {loading ? <ActivityIndicator color="#f7f3ea" /> : <Text style={styles.primaryButtonText}>Entrar com seguranca</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.appName}>Drac</Text>
          <Text style={styles.headerMeta}>{session.user.name} - {session.user.role}</Text>
        </View>
        <Pressable onPress={loadAll} style={styles.refreshButton}>
          <Text style={styles.refreshText}>{refreshing ? 'Atualizando' : 'Atualizar'}</Text>
        </Pressable>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />} contentContainerStyle={styles.content}>
        {tab === 'dashboard' && (
          <View style={styles.page}>
            <LinearGradient colors={['#1d241f', '#2d3a30']} style={styles.heroCard}>
              <View>
                <Text style={styles.heroEyebrow}>Cameras</Text>
                <Text style={styles.heroTitle}>{onlineCount}/{cameras.length} online</Text>
                <Text style={styles.heroSubtitle}>Toque em uma camera para abrir em tela dedicada. O grid agora fica em uma aba propria.</Text>
              </View>
              <View style={styles.heroDot} />
            </LinearGradient>

            <View style={styles.metricsRow}>
              <Metric label="Grupos" value={groupedCameras.length} />
              <Metric label="PTZ" value={controllableCount} />
              <Metric label="Gravacao" value={recordableCount} />
            </View>

            {groupedCameras.map(([groupName, items]) => (
              <View key={groupName} style={styles.groupBlock}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{groupName}</Text>
                  <Text style={styles.groupCount}>{items.length} cameras</Text>
                </View>
                {items.map((camera) => (
                  <Pressable
                    key={camera.id}
                    onPress={() => { setSelectedCameraId(camera.id); setTab('live'); }}
                    style={styles.cameraCard}
                  >
                    <View style={styles.cameraPreview}>
                      {streamPosters[camera.id] ? (
                        <Image source={{ uri: streamPosters[camera.id] ?? undefined }} style={styles.cameraPreviewImage} />
                      ) : (
                        <View style={styles.cameraPreviewFallback}>
                          <Text style={styles.cameraPreviewText}>DRAC</Text>
                        </View>
                      )}
                      <View style={styles.cameraPreviewShade} />
                      <View style={[styles.liveBadge, isOnline(camera) ? styles.liveBadgeOnline : styles.liveBadgeOffline]}>
                        <View style={[styles.liveDot, isOnline(camera) ? styles.liveDotOnline : styles.liveDotOffline]} />
                        <Text style={[styles.liveBadgeText, isOnline(camera) ? styles.liveBadgeTextOnline : styles.liveBadgeTextOffline]}>
                          {isOnline(camera) ? 'AO VIVO' : 'OFF'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.cameraCardBody}>
                      <View style={styles.cameraCardTop}>
                        <Text style={styles.cameraName}>{camera.name}</Text>
                        <View style={[styles.statusPill, isOnline(camera) ? styles.statusOnline : styles.statusOffline]}>
                          <Text style={[styles.statusText, isOnline(camera) ? styles.statusTextOnline : styles.statusTextOffline]}>{camera.status}</Text>
                        </View>
                      </View>
                      <Text style={styles.cameraMeta}>{camera.ip}</Text>
                      <Text style={styles.cameraMeta}>{formatResolution(camera)}</Text>
                      <View style={styles.permissionRow}>
                        <Text style={styles.permissionBadge}>VIEW</Text>
                        {camera.canControl ? <Text style={styles.permissionBadge}>PTZ</Text> : null}
                        {camera.canRecord ? <Text style={styles.permissionBadge}>REC</Text> : null}
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        )}

        {tab === 'live' && (
          <View style={styles.page}>
            {selectedCamera ? (
              <View style={styles.cameraStage}>
                <View style={styles.cameraHeroHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>{selectedCamera.name}</Text>
                    <Text style={styles.sectionSubtitle}>{selectedCamera.group?.name ?? 'Sem grupo'} - {formatResolution(selectedCamera)}</Text>
                  </View>
                  <View style={[styles.statusPill, isOnline(selectedCamera) ? styles.statusOnline : styles.statusOffline]}>
                    <Text style={[styles.statusText, isOnline(selectedCamera) ? styles.statusTextOnline : styles.statusTextOffline]}>{selectedCamera.status}</Text>
                  </View>
                </View>

                <View style={styles.singleVideoCard}>
                  <LiveVideo uri={streamUrls[selectedCamera.id] ?? null} posterUri={streamPosters[selectedCamera.id] ?? null} />
                  <View style={styles.singleVideoTopOverlay}>
                    <Text style={styles.liveNowText}>AO VIVO</Text>
                    <Text style={styles.videoProtocol}>HLS</Text>
                  </View>
                </View>

                <View style={styles.actionDock}>
                  <ActionPill label="Gravar" tone="danger" disabled={!selectedCamera.canRecord} onPress={() => toggleRecording(selectedCamera, true)} />
                  <ActionPill label="Parar" tone="success" disabled={!selectedCamera.canRecord} onPress={() => toggleRecording(selectedCamera, false)} />
                  <ActionPill label="Alarme" disabled={!relays[selectedCamera.id]?.triggerable} onPress={triggerRelay} />
                </View>

                <View style={styles.ptzCardPremium}>
                  <View style={styles.ptzHeader}>
                    <View>
                      <Text style={styles.ptzTitle}>PTZ</Text>
                      <Text style={styles.ptzSubtitle}>{selectedCamera.canControl ? 'Pressione para mover. Solto, comando enviado.' : 'Sem permissao para controlar'}</Text>
                    </View>
                    {ptzFeedback ? <Text style={styles.ptzFeedback}>Enviado: {ptzFeedback}</Text> : null}
                  </View>

                  <View style={styles.ptzConsole}>
                    <View style={styles.ptzDpad}>
                      <PtzButton label="▲" direction="Up" disabled={!selectedCamera.canControl} active={ptzActive === 'Up'} onPress={sendPtz} style={styles.ptzUp} />
                      <PtzButton label="◀" direction="Left" disabled={!selectedCamera.canControl} active={ptzActive === 'Left'} onPress={sendPtz} style={styles.ptzLeft} />
                      <View style={styles.ptzNub}><Text style={styles.ptzNubText}>DRAC</Text></View>
                      <PtzButton label="▶" direction="Right" disabled={!selectedCamera.canControl} active={ptzActive === 'Right'} onPress={sendPtz} style={styles.ptzRight} />
                      <PtzButton label="▼" direction="Down" disabled={!selectedCamera.canControl} active={ptzActive === 'Down'} onPress={sendPtz} style={styles.ptzDown} />
                    </View>
                    <View style={styles.zoomColumn}>
                      <PtzButton label="+" direction="ZoomIn" disabled={!selectedCamera.canControl} active={ptzActive === 'ZoomIn'} onPress={sendPtz} style={styles.zoomButton} />
                      <PtzButton label="-" direction="ZoomOut" disabled={!selectedCamera.canControl} active={ptzActive === 'ZoomOut'} onPress={sendPtz} style={styles.zoomButton} />
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Selecione uma camera</Text>
                <Text style={styles.emptyText}>Volte em Cameras e toque em uma camera para abrir o ao vivo.</Text>
              </View>
            )}
          </View>
        )}

        {tab === 'grid' && (
          <View style={styles.page}>
            <View style={styles.sectionHeaderInline}>
              <View>
                <Text style={styles.sectionTitle}>Grid</Text>
                <Text style={styles.sectionSubtitle}>Visualizacao rapida de grupos de cameras.</Text>
              </View>
              <View style={styles.segmentedMini}>
                {GRID_OPTIONS.map((size) => (
                  <Chip key={size} label={`${size}`} active={gridSize === size} onPress={() => setGridSize(size)} />
                ))}
              </View>
            </View>

            <View style={[styles.gridBoard, gridSize === 1 && styles.gridBoardOne, gridSize === 4 && styles.gridBoardFour]}>
              {visibleGridCameras.map((camera) => (
                <Pressable
                  key={camera.id}
                  onPress={() => { setSelectedCameraId(camera.id); setTab('live'); }}
                  style={[styles.gridTilePro, gridSize === 4 && styles.gridTileProHalf, selectedCamera?.id === camera.id && styles.gridTileActive]}
                >
                  <View style={styles.videoFrame}>
                    <LiveVideo uri={streamUrls[camera.id] ?? null} posterUri={streamPosters[camera.id] ?? null} />
                    <View style={styles.videoOverlayTop}>
                      <Text style={styles.videoOverlayTitle}>{camera.name}</Text>
                      <Text style={styles.videoProtocol}>LIVE</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>

            {groupedCameras.map(([groupName, items]) => (
              <View key={groupName} style={styles.groupBlockCompact}>
                <Text style={styles.groupTitle}>{groupName}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cameraChips}>
                  {items.map((camera) => (
                    <Chip key={camera.id} label={camera.name} active={selectedCamera?.id === camera.id} onPress={() => setSelectedCameraId(camera.id)} />
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
        )}

        {tab === 'playback' && (
          <View style={styles.page}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Playback</Text>
                <Text style={styles.sectionSubtitle}>Gravacoes do dia com abrir e baixar direto.</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cameraChips}>
              {cameras.map((camera) => <Chip key={camera.id} label={camera.name} active={selectedCamera?.id === camera.id} onPress={() => setSelectedCameraId(camera.id)} />)}
            </ScrollView>
            <View style={styles.timeline}>
              {recordings.map((recording) => (
                <View key={recording.id} style={styles.recordingCard}>
                  <View style={styles.timelineRail} />
                  <View style={styles.recordingBody}>
                    <Text style={styles.recordingTitle}>{formatTime(recording.startedAt)} - {formatTime(recording.endedAt)}</Text>
                    <Text style={styles.cameraMeta}>{formatDuration(recording.durationSeconds)} - {formatBytes(recording.sizeBytes)}</Text>
                    <View style={styles.rowButtons}>
                      <Pressable onPress={() => openPlayback(recording)} style={styles.smallButton}><Text style={styles.smallButtonText}>Abrir</Text></Pressable>
                      <Pressable onPress={() => downloadRecording(recording)} style={styles.smallButtonDark}><Text style={styles.smallButtonDarkText}>Baixar</Text></Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
            {!recordings.length ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Sem gravacoes hoje</Text>
                <Text style={styles.emptyText}>Troque a camera acima ou atualize para buscar novos segmentos.</Text>
              </View>
            ) : null}
          </View>
        )}

        {tab === 'profile' && (
          <View style={styles.page}>
            <View style={styles.profileCard}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{session.user.name.slice(0, 1).toUpperCase()}</Text></View>
              <Text style={styles.profileName}>{session.user.name}</Text>
              <Text style={styles.profileMeta}>{session.user.email}</Text>
              <View style={styles.profileInfo}>
                <Text style={styles.infoLabel}>Perfil</Text>
                <Text style={styles.infoValue}>{session.user.role}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.infoLabel}>API</Text>
                <Text style={styles.infoValue}>{session.apiUrl}</Text>
              </View>
              <Pressable onPress={logout} style={styles.logoutButton}><Text style={styles.logoutText}>Sair do app</Text></Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.tabs}>
        {(['dashboard', 'live', 'grid', 'playback', 'profile'] as Tab[]).map((item) => (
          <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}>
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === 'dashboard' ? 'Cameras' : item === 'live' ? 'Ao vivo' : item === 'grid' ? 'Grid' : item === 'playback' ? 'Playback' : 'Perfil'}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071013' },
  loginScreen: { flex: 1 },
  loginSafe: { flex: 1, justifyContent: 'space-between', padding: 20, paddingTop: 64, paddingBottom: 28 },
  loginHero: { gap: 10 },
  logoMark: { width: 76, height: 76, borderRadius: 28, backgroundColor: '#10221f', alignItems: 'center', justifyContent: 'center', shadowColor: '#28d08a', shadowOpacity: 0.28, shadowRadius: 24, elevation: 10, borderWidth: 1, borderColor: '#22443c' },
  logoLens: { width: 34, height: 34, borderRadius: 17, borderWidth: 8, borderColor: '#42d392', backgroundColor: '#071013' },
  loginBrand: { color: '#d8fff0', fontSize: 16, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase', marginTop: 8 },
  loginTitle: { color: '#f5fff9', fontSize: 36, lineHeight: 40, fontWeight: '900', maxWidth: 330 },
  loginSubtitle: { color: '#8aa39a', fontSize: 15, lineHeight: 22, maxWidth: 350 },
  loginCard: { backgroundColor: 'rgba(13,26,25,0.92)', borderWidth: 1, borderColor: 'rgba(100,255,190,0.12)', borderRadius: 30, padding: 18, gap: 8, shadowColor: '#000', shadowOpacity: 0.36, shadowRadius: 28, elevation: 12 },
  formLabel: { color: '#7c938b', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, marginLeft: 2, marginTop: 4 },
  input: { height: 52, borderWidth: 1, borderColor: '#1f3835', backgroundColor: '#091817', borderRadius: 18, paddingHorizontal: 14, color: '#f4fff8', fontSize: 14 },
  primaryButton: { height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#28d08a', marginTop: 10, shadowColor: '#28d08a', shadowOpacity: 0.26, shadowRadius: 18, elevation: 7 },
  primaryButtonText: { color: '#06120f', fontWeight: '900', fontSize: 14 },

  topBar: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderColor: '#10211f', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#071013' },
  appName: { color: '#effff7', fontSize: 25, fontWeight: '900', letterSpacing: 0.2 },
  headerMeta: { color: '#789087', fontSize: 12, marginTop: 2 },
  refreshButton: { borderWidth: 1, borderColor: '#1d3632', backgroundColor: '#0c1b19', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  refreshText: { color: '#d6fff0', fontSize: 12, fontWeight: '900' },
  content: { padding: 16, paddingBottom: 142, backgroundColor: '#071013' },
  page: { gap: 16 },

  heroCard: { borderRadius: 32, padding: 22, minHeight: 158, justifyContent: 'space-between', overflow: 'hidden', borderWidth: 1, borderColor: '#245047' },
  heroEyebrow: { color: '#8ef0bf', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
  heroTitle: { color: '#f4fff8', fontSize: 29, fontWeight: '900', marginTop: 8 },
  heroSubtitle: { color: '#a4bbb2', fontSize: 13, marginTop: 6, lineHeight: 19, maxWidth: 290 },
  heroDot: { position: 'absolute', right: -36, bottom: -42, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(40,208,138,0.18)' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, borderWidth: 1, borderColor: '#14302d', backgroundColor: '#0d1b1a', borderRadius: 24, padding: 15, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 2 },
  metricValue: { color: '#f4fff8', fontSize: 24, fontWeight: '900' },
  metricLabel: { color: '#7f958d', fontSize: 11, fontWeight: '800', marginTop: 2 },

  groupBlock: { gap: 12, marginTop: 4 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupTitle: { color: '#e6fff4', fontSize: 14, fontWeight: '900' },
  groupCount: { color: '#738b83', fontSize: 12, fontWeight: '800' },
  cameraCard: { borderWidth: 1, borderColor: '#132927', backgroundColor: '#0d1b1a', borderRadius: 28, padding: 10, flexDirection: 'row', gap: 13, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 18, elevation: 4 },
  cameraPreview: { width: 112, minHeight: 96, borderRadius: 22, backgroundColor: '#030807', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cameraPreviewImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover' },
  cameraPreviewFallback: { position: 'absolute', width: '100%', height: '100%', backgroundColor: '#10211f', alignItems: 'center', justifyContent: 'center' },
  cameraPreviewShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  cameraPreviewText: { color: '#42d392', fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  liveBadge: { position: 'absolute', left: 8, top: 8, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', gap: 5, alignItems: 'center', borderWidth: 1 },
  liveBadgeOnline: { backgroundColor: 'rgba(40,208,138,0.18)', borderColor: 'rgba(40,208,138,0.36)' },
  liveBadgeOffline: { backgroundColor: 'rgba(255,91,91,0.16)', borderColor: 'rgba(255,91,91,0.32)' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveDotOnline: { backgroundColor: '#28d08a' },
  liveDotOffline: { backgroundColor: '#ff6b6b' },
  liveBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  liveBadgeTextOnline: { color: '#c7ffdf' },
  liveBadgeTextOffline: { color: '#ffd4d4' },
  cameraCardBody: { flex: 1, gap: 4, justifyContent: 'center' },
  cameraCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cameraName: { color: '#f4fff8', fontWeight: '900', fontSize: 16, flexShrink: 1 },
  cameraMeta: { color: '#7f958d', fontSize: 12, marginTop: 2 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  statusOnline: { backgroundColor: 'rgba(40,208,138,0.14)', borderColor: 'rgba(40,208,138,0.32)' },
  statusOffline: { backgroundColor: 'rgba(255,91,91,0.12)', borderColor: 'rgba(255,91,91,0.28)' },
  statusText: { fontSize: 9, fontWeight: '900' },
  statusTextOnline: { color: '#84f6b7' },
  statusTextOffline: { color: '#ff9d9d' },
  permissionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  permissionBadge: { color: '#b7d1c7', backgroundColor: '#122724', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, fontWeight: '900' },

  sectionHeader: { gap: 10 },
  sectionTitle: { color: '#f4fff8', fontSize: 25, fontWeight: '900' },
  sectionSubtitle: { color: '#7f958d', fontSize: 13, marginTop: 2 },
  segmented: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#1d3632', backgroundColor: '#0d1b1a', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: '#28d08a', borderColor: '#28d08a' },
  chipText: { color: '#9ab1a8', fontWeight: '900', fontSize: 12 },
  chipTextActive: { color: '#06120f' },

  grid: { gap: 12 },
  gridTile: { borderWidth: 1, borderColor: '#132927', backgroundColor: '#0d1b1a', borderRadius: 26, overflow: 'hidden' },
  gridTileActive: { borderColor: '#28d08a', borderWidth: 2 },
  videoFrame: { position: 'relative', backgroundColor: '#030807', overflow: 'hidden' },
  videoPoster: { position: 'absolute', width: '100%', aspectRatio: 16 / 9, resizeMode: 'cover', opacity: 0.72 },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#030807' },
  videoEmpty: { alignItems: 'center', justifyContent: 'center', padding: 18 },
  videoEmptyTitle: { color: '#effff7', fontSize: 14, fontWeight: '900' },
  videoEmptyText: { color: '#789087', fontSize: 12, marginTop: 4, textAlign: 'center' },
  videoOverlayTop: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between' },
  videoOverlayTitle: { color: '#f4fff8', fontSize: 12, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  videoProtocol: { color: '#06120f', fontSize: 10, fontWeight: '900', backgroundColor: '#28d08a', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  tileFooter: { padding: 12 },
  tileTitle: { color: '#eafff5', fontWeight: '900', fontSize: 13 },
  tileMeta: { color: '#7f958d', fontSize: 11, marginTop: 2 },

  controlCard: { borderWidth: 1, borderColor: '#15302d', backgroundColor: '#0d1b1a', borderRadius: 30, padding: 15, gap: 15, shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 18, elevation: 3 },
  controlHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  panelTitle: { color: '#f4fff8', fontWeight: '900', fontSize: 18 },
  actionGrid: { flexDirection: 'row', gap: 8 },
  actionPill: { flex: 1, borderWidth: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  actionPill_neutral: { borderColor: '#23413c', backgroundColor: '#112320' },
  actionPill_danger: { borderColor: 'rgba(255,91,91,0.34)', backgroundColor: 'rgba(255,91,91,0.12)' },
  actionPill_success: { borderColor: 'rgba(40,208,138,0.34)', backgroundColor: 'rgba(40,208,138,0.12)' },
  actionPillText: { fontWeight: '900', fontSize: 12 },
  actionPillText_neutral: { color: '#d9fff0' },
  actionPillText_danger: { color: '#ff9d9d' },
  actionPillText_success: { color: '#84f6b7' },
  disabled: { opacity: 0.36 },
  ptzCard: { backgroundColor: '#091817', borderRadius: 26, padding: 15, gap: 14, borderWidth: 1, borderColor: '#132927' },
  ptzHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ptzTitle: { color: '#f4fff8', fontWeight: '900', fontSize: 14 },
  ptzSubtitle: { color: '#7f958d', fontSize: 12, fontWeight: '800' },
  ptzPad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ptzButton: { width: '30%', minHeight: 56, borderWidth: 1, borderColor: '#1d3632', borderRadius: 19, backgroundColor: '#0e201d', alignItems: 'center', justifyContent: 'center' },
  ptzCenter: { width: '30%', minHeight: 56, borderRadius: 19, backgroundColor: '#28d08a', alignItems: 'center', justifyContent: 'center' },
  ptzText: { color: '#d9fff0', fontWeight: '900', fontSize: 11 },
  ptzCenterText: { color: '#06120f', fontWeight: '900', fontSize: 12 },
  ptzSpacer: { width: '30%', minHeight: 56 },
  zoomRow: { flexDirection: 'row', gap: 8 },


  cameraStage: { gap: 16 },
  cameraHeroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  singleVideoCard: { borderWidth: 1, borderColor: '#17332f', backgroundColor: '#020605', borderRadius: 30, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 26, elevation: 8 },
  singleVideoTopOverlay: { position: 'absolute', left: 12, right: 12, top: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveNowText: { color: '#f4fff8', fontSize: 11, fontWeight: '900', letterSpacing: 1, backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 11, paddingVertical: 6 },
  actionDock: { flexDirection: 'row', gap: 9, borderWidth: 1, borderColor: '#16322e', backgroundColor: '#091817', borderRadius: 24, padding: 9 },
  ptzCardPremium: { backgroundColor: '#0b1918', borderRadius: 30, padding: 16, gap: 16, borderWidth: 1, borderColor: '#17332f', shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 20, elevation: 5 },
  ptzFeedback: { color: '#06120f', backgroundColor: '#28d08a', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontSize: 10, fontWeight: '900' },
  ptzConsole: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  ptzDpad: { width: 210, height: 210, borderRadius: 105, backgroundColor: '#06100f', borderWidth: 1, borderColor: '#17332f', position: 'relative', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, elevation: 5 },
  ptzRoundButton: { position: 'absolute', width: 66, height: 66, borderRadius: 28, backgroundColor: '#102320', borderWidth: 1, borderColor: '#24443e', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 },
  ptzRoundButtonActive: { backgroundColor: '#28d08a', borderColor: '#84f6b7', transform: [{ scale: 0.92 }], shadowColor: '#28d08a', shadowOpacity: 0.35, shadowRadius: 20 },
  ptzRoundText: { color: '#d9fff0', fontSize: 24, fontWeight: '900' },
  ptzRoundTextActive: { color: '#06120f' },
  ptzUp: { top: 10, left: 72 },
  ptzLeft: { left: 10, top: 72 },
  ptzRight: { right: 10, top: 72 },
  ptzDown: { bottom: 10, left: 72 },
  ptzNub: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#152c28', borderWidth: 1, borderColor: '#295049', alignItems: 'center', justifyContent: 'center' },
  ptzNubText: { color: '#8aa39a', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  zoomColumn: { gap: 12 },
  zoomButton: { position: 'relative', width: 62, height: 82, borderRadius: 24 },
  sectionHeaderInline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  segmentedMini: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  gridBoard: { gap: 12 },
  gridBoardOne: { gap: 14 },
  gridBoardFour: { flexDirection: 'row', flexWrap: 'wrap' },
  gridTilePro: { borderWidth: 1, borderColor: '#132927', backgroundColor: '#0d1b1a', borderRadius: 24, overflow: 'hidden', width: '100%', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, elevation: 3 },
  gridTileProHalf: { width: '48.2%' },
  groupBlockCompact: { gap: 9, borderTopWidth: 1, borderColor: '#10211f', paddingTop: 14 },

  cameraChips: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  timeline: { gap: 10 },
  recordingCard: { borderWidth: 1, borderColor: '#132927', backgroundColor: '#0d1b1a', borderRadius: 24, padding: 13, flexDirection: 'row', gap: 12 },
  timelineRail: { width: 4, borderRadius: 999, backgroundColor: '#28d08a' },
  recordingBody: { flex: 1, gap: 8 },
  recordingTitle: { color: '#f4fff8', fontWeight: '900', fontSize: 15 },
  rowButtons: { flexDirection: 'row', gap: 8 },
  smallButton: { borderRadius: 15, backgroundColor: '#28d08a', paddingHorizontal: 14, paddingVertical: 10 },
  smallButtonText: { color: '#06120f', fontWeight: '900', fontSize: 12 },
  smallButtonDark: { borderRadius: 15, backgroundColor: '#112320', borderWidth: 1, borderColor: '#1d3632', paddingHorizontal: 14, paddingVertical: 10 },
  smallButtonDarkText: { color: '#d9fff0', fontWeight: '900', fontSize: 12 },
  emptyCard: { borderWidth: 1, borderColor: '#132927', backgroundColor: '#0d1b1a', borderRadius: 26, padding: 24, alignItems: 'center' },
  emptyTitle: { color: '#f4fff8', fontSize: 16, fontWeight: '900' },
  emptyText: { color: '#7f958d', textAlign: 'center', marginTop: 6, lineHeight: 18 },

  profileCard: { backgroundColor: '#0d1b1a', borderWidth: 1, borderColor: '#132927', borderRadius: 30, padding: 22, alignItems: 'center', gap: 11 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#28d08a', alignItems: 'center', justifyContent: 'center', shadowColor: '#28d08a', shadowOpacity: 0.25, shadowRadius: 14, elevation: 5 },
  avatarText: { color: '#06120f', fontSize: 28, fontWeight: '900' },
  profileName: { color: '#f4fff8', fontSize: 22, fontWeight: '900', marginTop: 4 },
  profileMeta: { color: '#7f958d', fontSize: 13 },
  profileInfo: { width: '100%', borderWidth: 1, borderColor: '#18322f', borderRadius: 19, padding: 13, marginTop: 4, backgroundColor: '#091817' },
  infoLabel: { color: '#789087', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  infoValue: { color: '#d9fff0', fontSize: 13, fontWeight: '800', marginTop: 4 },
  logoutButton: { width: '100%', height: 52, borderRadius: 19, backgroundColor: 'rgba(255,91,91,0.14)', borderWidth: 1, borderColor: 'rgba(255,91,91,0.28)', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  logoutText: { color: '#ff9d9d', fontSize: 14, fontWeight: '900' },
  tabs: { position: 'absolute', left: 12, right: 12, bottom: 28, backgroundColor: 'rgba(9,24,23,0.98)', borderWidth: 1, borderColor: '#16322e', borderRadius: 28, padding: 6, flexDirection: 'row', gap: 4, shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 24, elevation: 20 },
  tab: { flex: 1, alignItems: 'center', borderRadius: 20, paddingVertical: 11 },
  tabActive: { backgroundColor: '#28d08a' },
  tabText: { color: '#789087', fontSize: 11, fontWeight: '900' },
  tabTextActive: { color: '#06120f' },
});
