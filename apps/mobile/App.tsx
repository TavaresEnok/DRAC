import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';

const DEFAULT_API_URL = 'http://168.194.13.70:3000';
const SESSION_KEY = 'drac.mobile.session.v1';
const GRID_OPTIONS = [1, 2, 4] as const;
const TOP_SAFE = Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 24 : 0;
const BOTTOM_SAFE = Platform.OS === 'android' ? 30 : 0;

type GridSize = (typeof GRID_OPTIONS)[number];
type Direction = 'Up' | 'Down' | 'Left' | 'Right' | 'ZoomIn' | 'ZoomOut';
type Tab = 'dashboard' | 'live' | 'grid' | 'playback' | 'profile';
type IconName = 'home' | 'grid' | 'user' | 'settings' | 'camera' | 'mic' | 'video' | 'chevronLeft' | 'plus' | 'bell' | 'move' | 'play' | 'download' | 'calendar';

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

type ActivePlayback = {
  recording: Recording;
  url: string;
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

function SvgIcon({ name, size = 24, color = 'currentColor' }: { name: IconName; size?: number; color?: string }) {
  const common = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'home' ? <Path {...common} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> : null}
      {name === 'grid' ? <><Rect {...common} x="3" y="3" width="7" height="7" /><Rect {...common} x="14" y="3" width="7" height="7" /><Rect {...common} x="14" y="14" width="7" height="7" /><Rect {...common} x="3" y="14" width="7" height="7" /></> : null}
      {name === 'user' ? <><Path {...common} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><Circle {...common} cx="12" cy="7" r="4" /></> : null}
      {name === 'settings' ? <><Circle {...common} cx="12" cy="12" r="3" /><Path {...common} d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></> : null}
      {name === 'camera' ? <><Path {...common} d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><Circle {...common} cx="12" cy="13" r="4" /></> : null}
      {name === 'mic' ? <><Path {...common} d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><Path {...common} d="M19 10v2a7 7 0 0 1-14 0v-2" /><Line {...common} x1="12" y1="19" x2="12" y2="23" /><Line {...common} x1="8" y1="23" x2="16" y2="23" /></> : null}
      {name === 'video' ? <><Polygon {...common} points="23 7 16 12 23 17 23 7" /><Rect {...common} x="1" y="5" width="15" height="14" rx="2" ry="2" /></> : null}
      {name === 'chevronLeft' ? <Polyline {...common} points="15 18 9 12 15 6" /> : null}
      {name === 'plus' ? <><Line {...common} x1="12" y1="5" x2="12" y2="19" /><Line {...common} x1="5" y1="12" x2="19" y2="12" /></> : null}
      {name === 'bell' ? <><Path {...common} d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><Path {...common} d="M13.73 21a2 2 0 0 1-3.46 0" /></> : null}
      {name === 'move' ? <><Polyline {...common} points="5 9 2 12 5 15" /><Polyline {...common} points="9 5 12 2 15 5" /><Polyline {...common} points="19 9 22 12 19 15" /><Polyline {...common} points="9 19 12 22 15 19" /><Line {...common} x1="2" y1="12" x2="22" y2="12" /><Line {...common} x1="12" y1="2" x2="12" y2="22" /></> : null}
      {name === 'play' ? <Polygon points="5 3 19 12 5 21 5 3" fill={color} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {name === 'download' ? <><Path {...common} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><Polyline {...common} points="7 10 12 15 17 10" /><Line {...common} x1="12" y1="15" x2="12" y2="3" /></> : null}
      {name === 'calendar' ? <><Rect {...common} x="3" y="4" width="18" height="18" rx="2" ry="2" /><Line {...common} x1="16" y1="2" x2="16" y2="6" /><Line {...common} x1="8" y1="2" x2="8" y2="6" /><Line {...common} x1="3" y1="10" x2="21" y2="10" /></> : null}
    </Svg>
  );
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

function PlaybackVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = false;
    instance.play();
  });

  return <VideoView player={player} style={styles.playbackVideo} nativeControls contentFit="contain" />;
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
  const [activePlayback, setActivePlayback] = useState<ActivePlayback | null>(null);
  const [relays, setRelays] = useState<Record<string, RelayDiscovery>>({});
  const [ptzActive, setPtzActive] = useState<Direction | null>(null);
  const [ptzFeedback, setPtzFeedback] = useState<string | null>(null);
  const [showPtz, setShowPtz] = useState(true);
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
      setActivePlayback(null);
    } catch {
      setRecordings([]);
      setActivePlayback(null);
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
      setActivePlayback({ recording, url });
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
      <LinearGradient colors={['#020617', '#0f172a', '#064e3b']} style={styles.loginScreen}>
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
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />} contentContainerStyle={styles.content}>
        {tab === 'dashboard' && (
          <View style={styles.page}>
            <View style={styles.dashboardHeader}>
              <View>
                <Text style={styles.dashboardTitle}>Minha Casa</Text>
                <Text style={styles.dashboardSubtitle}>{cameras.length} Dispositivos</Text>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <Metric label="Cameras" value={cameras.length} />
              <Metric label="Com PTZ" value={controllableCount} />
              <Metric label="Gravando" value={recordableCount} />
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
                    onPress={() => { setSelectedCameraId(camera.id); setShowPtz(true); setTab('live'); }}
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
                        <Pressable style={styles.cardPlayButton}><SvgIcon name="play" size={18} color="#34d399" /></Pressable>
                      </View>
                      <Text style={styles.cameraMeta}>{camera.group?.name ?? 'Sem grupo'}</Text>
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
                <View style={styles.cameraDetailHeader}>
                  <Pressable onPress={() => { setTab('dashboard'); setShowPtz(true); }} style={styles.headerIconButton}>
                    <SvgIcon name="chevronLeft" size={28} color="#cbd5e1" />
                  </Pressable>
                  <View>
                    <Text style={styles.cameraDetailTitle}>{selectedCamera.name}</Text>
                    <Text style={styles.cameraDetailSubtitle}>{isOnline(selectedCamera) ? 'Conectado' : 'Offline'}</Text>
                  </View>
                  <Pressable style={styles.headerIconButton}>
                    <SvgIcon name="settings" size={23} color="#cbd5e1" />
                  </Pressable>
                </View>

                <View style={styles.singleVideoCard}>
                  <LiveVideo uri={streamUrls[selectedCamera.id] ?? null} posterUri={streamPosters[selectedCamera.id] ?? null} />
                  <View style={styles.singleVideoTopOverlay}>
                    <Text style={styles.liveNowText}>AO VIVO</Text>
                    <Text style={styles.videoProtocol}>HLS</Text>
                  </View>
                </View>

                <View style={styles.quickActionsGrid}>
                  <Pressable style={styles.quickActionButton}>
                    <View style={styles.quickActionIcon}><SvgIcon name="mic" color="#cbd5e1" /></View>
                    <Text style={styles.quickActionLabel}>Falar</Text>
                  </Pressable>
                  <Pressable style={styles.quickActionButton}>
                    <View style={styles.quickActionIcon}><SvgIcon name="camera" color="#cbd5e1" /></View>
                    <Text style={styles.quickActionLabel}>Foto</Text>
                  </Pressable>
                  <Pressable disabled={!selectedCamera.canRecord} onPress={() => toggleRecording(selectedCamera, true)} style={[styles.quickActionButton, !selectedCamera.canRecord && styles.disabled]}>
                    <View style={styles.quickActionIcon}><SvgIcon name="video" color="#cbd5e1" /></View>
                    <Text style={styles.quickActionLabel}>Gravar</Text>
                  </Pressable>
                  <Pressable disabled={!selectedCamera.canControl} onPress={() => setShowPtz((value) => !value)} style={[styles.quickActionButton, !selectedCamera.canControl && styles.disabled]}>
                    <View style={[styles.quickActionIcon, showPtz && styles.quickActionIconActive]}><SvgIcon name="move" color={showPtz ? '#020617' : '#cbd5e1'} /></View>
                    <Text style={styles.quickActionLabel}>PTZ</Text>
                  </Pressable>
                </View>

                {showPtz ? (
                  <View style={styles.ptzCardPremium}>
                    {ptzFeedback ? <Text style={styles.ptzFeedback}>Enviado: {ptzFeedback}</Text> : null}
                    <View style={styles.ptzConsole}>
                      <View style={styles.ptzDpad}>
                        <PtzButton label="⌃" direction="Up" disabled={!selectedCamera.canControl} active={ptzActive === 'Up'} onPress={sendPtz} style={styles.ptzUp} />
                        <PtzButton label="⌄" direction="Down" disabled={!selectedCamera.canControl} active={ptzActive === 'Down'} onPress={sendPtz} style={styles.ptzDown} />
                        <PtzButton label="‹" direction="Left" disabled={!selectedCamera.canControl} active={ptzActive === 'Left'} onPress={sendPtz} style={styles.ptzLeft} />
                        <PtzButton label="›" direction="Right" disabled={!selectedCamera.canControl} active={ptzActive === 'Right'} onPress={sendPtz} style={styles.ptzRight} />
                        <View style={styles.ptzNub}><View style={styles.ptzNubInner} /></View>
                      </View>
                    </View>
                  </View>
                ) : null}
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
            <View style={styles.mosaicHeader}>
              <Text style={styles.mosaicTitle}>Mosaico</Text>
              <Pressable style={styles.editLayoutButton}>
                <Text style={styles.editLayoutText}>Editar Layout</Text>
              </Pressable>
            </View>

            <View style={styles.mosaicGrid}>
              {cameras.map((camera) => (
                <Pressable
                  key={camera.id}
                  onPress={() => { setSelectedCameraId(camera.id); setShowPtz(true); setTab('live'); }}
                  style={styles.mosaicTile}
                >
                  {streamPosters[camera.id] ? <Image source={{ uri: streamPosters[camera.id] ?? undefined }} style={styles.mosaicImage} /> : null}
                  <View style={styles.mosaicShade} />
                  <View style={styles.mosaicVideoIcon}><SvgIcon name="video" size={16} color="#34d399" /></View>
                  <View style={styles.mosaicFooter}><Text style={styles.mosaicCameraName}>{camera.name}</Text></View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {tab === 'playback' && (
          <View style={styles.page}>
            <View>
              <Text style={styles.recordingsTitle}>Gravacoes</Text>
              <Text style={styles.recordingsSubtitle}>Selecione uma camera para ver os arquivos salvos e historico.</Text>
            </View>

            <View style={styles.recordingCameraList}>
              {cameras.map((camera) => (
                <Pressable key={camera.id} onPress={() => setSelectedCameraId(camera.id)} style={[styles.recordingCameraCard, selectedCamera?.id === camera.id && styles.recordingCameraCardActive]}>
                  <View style={styles.recordingCameraThumb}>
                    {streamPosters[camera.id] ? <Image source={{ uri: streamPosters[camera.id] ?? undefined }} style={styles.recordingCameraImage} /> : <SvgIcon name="camera" size={24} color="#475569" />}
                    {camera.canRecord ? <View style={styles.recordDot} /> : null}
                  </View>
                  <View style={styles.recordingCameraBody}>
                    <Text style={styles.recordingCameraTitle}>{camera.name}</Text>
                    <Text style={styles.recordingCameraMeta}>{camera.group?.name ?? 'Sem grupo'}</Text>
                    <View style={styles.recordingCameraHistory}>
                      <SvgIcon name="calendar" size={12} color="#34d399" />
                      <Text style={styles.recordingCameraHistoryText}>Ver Historico</Text>
                    </View>
                  </View>
                  <View style={styles.recordingCameraArrow}><Text style={styles.recordingCameraArrowText}>›</Text></View>
                </Pressable>
              ))}
            </View>

            {activePlayback ? (
              <View style={styles.playbackPlayerCard}>
                <View style={styles.playbackHeader}>
                  <View>
                    <Text style={styles.playbackTitle}>Reproduzindo no app</Text>
                    <Text style={styles.cameraMeta}>
                      {formatTime(activePlayback.recording.startedAt)} - {formatTime(activePlayback.recording.endedAt)}
                    </Text>
                  </View>
                  <Pressable onPress={() => setActivePlayback(null)} style={styles.closePlaybackButton}>
                    <Text style={styles.closePlaybackText}>Fechar</Text>
                  </Pressable>
                </View>
                <PlaybackVideo uri={activePlayback.url} />
                <View style={styles.rowButtons}>
                  <Pressable onPress={() => downloadRecording(activePlayback.recording)} style={styles.smallButton}>
                    <Text style={styles.smallButtonText}>Baixar esta gravacao</Text>
                  </Pressable>
                  <Pressable onPress={() => setActivePlayback(null)} style={styles.smallButtonDark}>
                    <Text style={styles.smallButtonDarkText}>Voltar para lista</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {selectedCamera ? (
              <View style={styles.dateCard}>
                <SvgIcon name="calendar" size={18} color="#34d399" />
                <Text style={styles.dateCardText}>Hoje</Text>
              </View>
            ) : null}

            <View style={styles.recordingTimeline}>
              {recordings.map((recording) => (
                <View key={recording.id} style={styles.recordingTimelineItem}>
                  <View style={styles.recordingTimelineDot} />
                  <View style={styles.recordingTimelineContent}>
                    <View style={styles.recordingTimelineTop}>
                      <View>
                        <Text style={styles.recordingTimelineTime}>{formatTime(recording.startedAt)} - {formatTime(recording.endedAt)}</Text>
                        <Text style={styles.recordingTimelineEvent}>{formatDuration(recording.durationSeconds)} · {formatBytes(recording.sizeBytes)}</Text>
                      </View>
                      <Pressable onPress={() => downloadRecording(recording)} style={styles.downloadCircle}>
                        <SvgIcon name="download" size={18} color="#cbd5e1" />
                      </Pressable>
                    </View>
                    <Pressable onPress={() => openPlayback(recording)} style={styles.recordingPreview}>
                      {selectedCamera && streamPosters[selectedCamera.id] ? <Image source={{ uri: streamPosters[selectedCamera.id] ?? undefined }} style={styles.recordingPreviewImage} /> : null}
                      <View style={styles.recordingPreviewShade} />
                      <View style={styles.recordingPlayCircle}><SvgIcon name="play" size={24} color="#ffffff" /></View>
                      <Text style={styles.recordingDurationBadge}>{formatDuration(recording.durationSeconds)}</Text>
                    </Pressable>
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
              {['Gerenciar Dispositivos', 'Armazenamento em Nuvem', 'Notificacoes', 'Ajuda e Suporte'].map((item) => (
                <View key={item} style={styles.settingsRow}><Text style={styles.settingsRowText}>{item}</Text></View>
              ))}
            </View>
            <Pressable onPress={logout} style={styles.logoutButton}><Text style={styles.logoutText}>Sair do app</Text></Pressable>
          </View>
        )}
      </ScrollView>

      {tab !== 'live' ? <View style={styles.tabs}>
        {(['dashboard', 'playback', 'grid', 'profile'] as Tab[]).map((item) => (
          <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}>
            <SvgIcon name={item === 'dashboard' ? 'home' : item === 'grid' ? 'grid' : item === 'playback' ? 'play' : 'user'} size={22} color={tab === item ? '#34d399' : '#64748b'} />
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === 'dashboard' ? 'Casa' : item === 'playback' ? 'Gravacao' : item === 'grid' ? 'Mosaico' : 'Perfil'}</Text>
          </Pressable>
        ))}
      </View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020617' },
  loginScreen: { flex: 1 },
  loginSafe: { flex: 1, justifyContent: 'space-between', padding: 20, paddingTop: 64, paddingBottom: 28 },
  loginHero: { gap: 10 },
  logoMark: { width: 80, height: 80, borderRadius: 30, backgroundColor: 'rgba(15,23,42,0.92)', alignItems: 'center', justifyContent: 'center', shadowColor: '#34d399', shadowOpacity: 0.32, shadowRadius: 28, elevation: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  logoLens: { width: 36, height: 36, borderRadius: 18, borderWidth: 8, borderColor: '#34d399', backgroundColor: '#020617' },
  loginBrand: { color: '#34d399', fontSize: 16, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase', marginTop: 8 },
  loginTitle: { color: '#f8fafc', fontSize: 36, lineHeight: 40, fontWeight: '900', maxWidth: 340 },
  loginSubtitle: { color: '#94a3b8', fontSize: 15, lineHeight: 22, maxWidth: 350 },
  loginCard: { backgroundColor: 'rgba(15,23,42,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 32, padding: 18, gap: 8, shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 30, elevation: 16 },
  formLabel: { color: '#64748b', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, marginLeft: 2, marginTop: 4 },
  input: { height: 54, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: 'rgba(2,6,23,0.72)', borderRadius: 19, paddingHorizontal: 15, color: '#f8fafc', fontSize: 14 },
  primaryButton: { height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10b981', marginTop: 10, shadowColor: '#34d399', shadowOpacity: 0.28, shadowRadius: 20, elevation: 8 },
  primaryButtonText: { color: '#02130f', fontWeight: '900', fontSize: 14 },

  topBar: { paddingHorizontal: 18, paddingTop: TOP_SAFE + 16, paddingBottom: 14, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617' },
  appName: { color: '#f8fafc', fontSize: 25, fontWeight: '900', letterSpacing: 0.4 },
  headerMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  refreshButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(15,23,42,0.86)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  refreshText: { color: '#34d399', fontSize: 12, fontWeight: '900' },
  content: { padding: 16, paddingTop: TOP_SAFE + 18, paddingBottom: BOTTOM_SAFE + 104, backgroundColor: '#020617' },
  page: { gap: 18 },
  dashboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  dashboardTitle: { color: '#ffffff', fontSize: 30, fontWeight: '900', letterSpacing: -0.6 },
  dashboardSubtitle: { color: '#94a3b8', fontSize: 14, marginTop: 4, fontWeight: '600' },
  addButton: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center', shadowColor: '#10b981', shadowOpacity: 0.3, shadowRadius: 20, elevation: 8 },

  heroCard: { borderRadius: 34, padding: 24, minHeight: 164, justifyContent: 'space-between', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, elevation: 7 },
  heroEyebrow: { color: '#34d399', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.8 },
  heroTitle: { color: '#f8fafc', fontSize: 31, fontWeight: '900', marginTop: 8, letterSpacing: -0.5 },
  heroSubtitle: { color: '#cbd5e1', fontSize: 13, marginTop: 7, lineHeight: 20, maxWidth: 305 },
  heroDot: { position: 'absolute', right: -42, bottom: -48, width: 176, height: 176, borderRadius: 88, backgroundColor: 'rgba(52,211,153,0.12)' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0f172a', borderRadius: 25, padding: 16, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 14, elevation: 3 },
  metricValue: { color: '#f8fafc', fontSize: 24, fontWeight: '900' },
  metricLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '800', marginTop: 2 },

  groupBlock: { gap: 13, marginTop: 4 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 3 },
  groupTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '900' },
  groupCount: { color: '#64748b', fontSize: 12, fontWeight: '800' },
  cameraCard: { height: 248, borderRadius: 30, overflow: 'hidden', backgroundColor: '#0f172a', borderWidth: 1, borderColor: 'rgba(30,41,59,0.86)', shadowColor: '#000', shadowOpacity: 0.48, shadowRadius: 22, elevation: 7 },
  cameraPreview: { position: 'absolute', left: 0, right: 0, top: 0, height: 178, backgroundColor: '#1e293b', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cameraPreviewImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.9 },
  cameraPreviewFallback: { position: 'absolute', width: '100%', height: '100%', backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  cameraPreviewShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,6,23,0.12)' },
  cameraPreviewText: { color: '#34d399', fontSize: 12, fontWeight: '900', letterSpacing: 2.2 },
  liveBadge: { position: 'absolute', left: 18, top: 18, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', gap: 7, alignItems: 'center', borderWidth: 1 },
  liveBadgeOnline: { backgroundColor: 'rgba(15,23,42,0.55)', borderColor: 'rgba(255,255,255,0.12)' },
  liveBadgeOffline: { backgroundColor: 'rgba(244,63,94,0.18)', borderColor: 'rgba(244,63,94,0.36)' },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveDotOnline: { backgroundColor: '#34d399' },
  liveDotOffline: { backgroundColor: '#fb7185' },
  liveBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  liveBadgeTextOnline: { color: '#a7f3d0' },
  liveBadgeTextOffline: { color: '#fecdd3' },
  cameraCardBody: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 70, zIndex: 5, gap: 3, backgroundColor: '#0f172a', borderTopWidth: 1, borderColor: 'rgba(30,41,59,0.72)', paddingHorizontal: 20, paddingVertical: 12 },
  cameraCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cameraName: { color: '#ffffff', fontWeight: '900', fontSize: 18, flexShrink: 1, letterSpacing: 0.2 },
  cameraMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2, fontWeight: '600' },
  cardPlayButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  statusPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  statusOnline: { backgroundColor: 'rgba(16,185,129,0.14)', borderColor: 'rgba(52,211,153,0.35)' },
  statusOffline: { backgroundColor: 'rgba(244,63,94,0.14)', borderColor: 'rgba(244,63,94,0.35)' },
  statusText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  statusTextOnline: { color: '#86efac' },
  statusTextOffline: { color: '#fda4af' },
  permissionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  permissionBadge: { color: '#d1fae5', backgroundColor: 'rgba(15,23,42,0.58)', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, fontSize: 10, fontWeight: '900', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  sectionHeader: { gap: 10 },
  sectionTitle: { color: '#f8fafc', fontSize: 25, fontWeight: '900', letterSpacing: -0.3 },
  sectionSubtitle: { color: '#94a3b8', fontSize: 13, marginTop: 2, lineHeight: 19 },
  segmented: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: '#0f172a', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  chipText: { color: '#94a3b8', fontWeight: '900', fontSize: 12 },
  chipTextActive: { color: '#02130f' },

  grid: { gap: 12 },
  gridTile: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0f172a', borderRadius: 26, overflow: 'hidden' },
  gridTileActive: { borderColor: '#34d399', borderWidth: 2 },
  videoFrame: { position: 'relative', backgroundColor: '#000000', overflow: 'hidden' },
  videoPoster: { position: 'absolute', width: '100%', aspectRatio: 16 / 9, resizeMode: 'cover', opacity: 0.72 },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000000' },
  videoEmpty: { alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: '#020617' },
  videoEmptyTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '900' },
  videoEmptyText: { color: '#94a3b8', fontSize: 12, marginTop: 4, textAlign: 'center' },
  videoOverlayTop: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between' },
  videoOverlayTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  videoProtocol: { color: '#02130f', fontSize: 10, fontWeight: '900', backgroundColor: '#34d399', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  tileFooter: { padding: 12 },
  tileTitle: { color: '#f8fafc', fontWeight: '900', fontSize: 13 },
  tileMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },

  controlCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0f172a', borderRadius: 30, padding: 15, gap: 15, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, elevation: 4 },
  controlHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  panelTitle: { color: '#f8fafc', fontWeight: '900', fontSize: 18 },
  actionGrid: { flexDirection: 'row', gap: 8 },
  actionPill: { flex: 1, borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  actionPill_neutral: { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#111827' },
  actionPill_danger: { borderColor: 'rgba(239,68,68,0.38)', backgroundColor: 'rgba(239,68,68,0.16)' },
  actionPill_success: { borderColor: 'rgba(52,211,153,0.36)', backgroundColor: 'rgba(16,185,129,0.15)' },
  actionPillText: { fontWeight: '900', fontSize: 12 },
  actionPillText_neutral: { color: '#e2e8f0' },
  actionPillText_danger: { color: '#fca5a5' },
  actionPillText_success: { color: '#6ee7b7' },
  disabled: { opacity: 0.36 },
  ptzCard: { backgroundColor: '#0f172a', borderRadius: 26, padding: 15, gap: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  ptzHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ptzTitle: { color: '#f8fafc', fontWeight: '900', fontSize: 14 },
  ptzSubtitle: { color: '#94a3b8', fontSize: 12, fontWeight: '800' },
  ptzPad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ptzButton: { width: '30%', minHeight: 56, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 19, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  ptzCenter: { width: '30%', minHeight: 56, borderRadius: 19, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  ptzText: { color: '#f8fafc', fontWeight: '900', fontSize: 11 },
  ptzCenterText: { color: '#02130f', fontWeight: '900', fontSize: 12 },
  ptzSpacer: { width: '30%', minHeight: 56 },
  zoomRow: { flexDirection: 'row', gap: 8 },

  cameraStage: { gap: 16 },
  cameraDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 2 },
  headerIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cameraDetailTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  cameraDetailSubtitle: { color: '#34d399', fontSize: 10, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.1, marginTop: 3 },
  cameraHeroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  singleVideoCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#000000', borderRadius: 32, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 28, elevation: 10 },
  singleVideoTopOverlay: { position: 'absolute', left: 12, right: 12, top: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveNowText: { color: '#d1fae5', fontSize: 11, fontWeight: '900', letterSpacing: 1.3, backgroundColor: 'rgba(0,0,0,0.64)', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  actionDock: { flexDirection: 'row', gap: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0f172a', borderRadius: 28, padding: 10, shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 18, elevation: 4 },
  quickActionsGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginVertical: 6 },
  quickActionButton: { flex: 1, alignItems: 'center', gap: 8 },
  quickActionIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  quickActionIconActive: { backgroundColor: '#10b981', borderColor: '#10b981', shadowColor: '#10b981', shadowOpacity: 0.32, shadowRadius: 15, elevation: 7 },
  quickActionLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  ptzCardPremium: { backgroundColor: 'transparent', borderRadius: 0, padding: 0, gap: 18, borderWidth: 0 },
  ptzFeedback: { color: '#02130f', backgroundColor: '#34d399', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontSize: 10, fontWeight: '900' },
  ptzConsole: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: '#0f172a', borderRadius: 32, borderWidth: 1, borderColor: 'rgba(30,41,59,0.9)', paddingVertical: 24, paddingHorizontal: 10, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 22, elevation: 8 },
  ptzDpad: { width: 224, height: 224, borderRadius: 112, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b', position: 'relative', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.52, shadowRadius: 24, elevation: 10 },
  ptzRoundButton: { position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: 'transparent', borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  ptzRoundButtonActive: { backgroundColor: 'rgba(16,185,129,0.16)', transform: [{ scale: 0.9 }] },
  ptzRoundText: { color: '#64748b', fontSize: 32, fontWeight: '900' },
  ptzRoundTextActive: { color: '#02130f' },
  ptzUp: { top: 12, left: 88 },
  ptzLeft: { left: 12, top: 88 },
  ptzRight: { right: 12, top: 88 },
  ptzDown: { bottom: 12, left: 88 },
  ptzNub: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1e293b', borderWidth: 4, borderColor: '#334155', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 16, elevation: 5 },
  ptzNubInner: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(51,65,85,0.52)' },
  ptzNubText: { color: '#475569', fontSize: 0, fontWeight: '900', letterSpacing: 0 },
  zoomColumn: { gap: 12 },
  zoomButton: { position: 'relative', width: 54, height: 54, borderRadius: 27, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b' },
  alertsCard: { width: '100%', gap: 12, marginTop: 4 },
  alertsTitle: { color: '#64748b', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 2 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b', borderRadius: 18, padding: 14 },
  alertIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(16,185,129,0.10)', alignItems: 'center', justifyContent: 'center' },
  alertBody: { flex: 1 },
  alertText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  alertTime: { color: '#64748b', fontSize: 12, marginTop: 2 },
  sectionHeaderInline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  segmentedMini: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  gridBoard: { gap: 12 },
  gridBoardOne: { gap: 14 },
  gridBoardFour: { flexDirection: 'row', flexWrap: 'wrap' },
  gridTilePro: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0f172a', borderRadius: 26, overflow: 'hidden', width: '100%', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, elevation: 4 },
  gridTileProHalf: { width: '48.2%' },
  groupBlockCompact: { gap: 9, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingTop: 14 },
  mosaicHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 4 },
  mosaicTitle: { color: '#ffffff', fontSize: 25, fontWeight: '900' },
  editLayoutButton: { borderWidth: 1, borderColor: 'rgba(52,211,153,0.24)', backgroundColor: 'rgba(16,185,129,0.10)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  editLayoutText: { color: '#34d399', fontSize: 13, fontWeight: '800' },
  mosaicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  mosaicTile: { width: '48.1%', aspectRatio: 1, backgroundColor: '#0f172a', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(30,41,59,0.86)', shadowColor: '#000', shadowOpacity: 0.34, shadowRadius: 14, elevation: 4 },
  mosaicImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.84 },
  mosaicShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,6,23,0.18)' },
  mosaicVideoIcon: { position: 'absolute', right: 8, top: 8, width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(2,6,23,0.72)', borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  mosaicFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 28, paddingBottom: 10, backgroundColor: 'rgba(2,6,23,0.62)' },
  mosaicCameraName: { color: '#ffffff', fontSize: 12, fontWeight: '800' },

  cameraChips: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  recordingsTitle: { color: '#ffffff', fontSize: 30, fontWeight: '900', marginBottom: 4 },
  recordingsSubtitle: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 6 },
  recordingCameraList: { gap: 12 },
  recordingCameraCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#0f172a', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(30,41,59,0.86)', padding: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, elevation: 4 },
  recordingCameraCardActive: { borderColor: 'rgba(52,211,153,0.55)' },
  recordingCameraThumb: { width: 96, height: 80, borderRadius: 18, backgroundColor: '#1e293b', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  recordingCameraImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.9 },
  recordDot: { position: 'absolute', left: 7, top: 7, width: 9, height: 9, borderRadius: 5, backgroundColor: '#f43f5e', shadowColor: '#f43f5e', shadowOpacity: 0.6, shadowRadius: 8, elevation: 4 },
  recordingCameraBody: { flex: 1 },
  recordingCameraTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  recordingCameraMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  recordingCameraHistory: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  recordingCameraHistoryText: { color: '#cbd5e1', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  recordingCameraArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  recordingCameraArrowText: { color: '#94a3b8', fontSize: 28, lineHeight: 30, fontWeight: '300' },
  playbackPlayerCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0f172a', borderRadius: 32, padding: 13, gap: 13, shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 22, elevation: 7 },
  playbackHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  playbackTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '900' },
  playbackVideo: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000000', borderRadius: 22, overflow: 'hidden' },
  closePlaybackButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#111827', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  closePlaybackText: { color: '#e2e8f0', fontSize: 11, fontWeight: '900' },
  timeline: { gap: 11 },
  dateCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b', borderRadius: 18, padding: 14 },
  dateCardText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  recordingTimeline: { marginLeft: 12, paddingLeft: 22, borderLeftWidth: 2, borderColor: '#1e293b', gap: 28 },
  recordingTimelineItem: { position: 'relative' },
  recordingTimelineDot: { position: 'absolute', left: -30, top: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#020617', borderWidth: 2, borderColor: '#10b981' },
  recordingTimelineContent: { gap: 12 },
  recordingTimelineTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  recordingTimelineTime: { color: '#34d399', fontSize: 14, fontWeight: '900' },
  recordingTimelineEvent: { color: '#cbd5e1', fontSize: 13, marginTop: 4 },
  downloadCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  recordingPreview: { height: 132, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#334155', backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  recordingPreviewImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.62 },
  recordingPreviewShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,6,23,0.18)' },
  recordingPlayCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(15,23,42,0.82)', alignItems: 'center', justifyContent: 'center' },
  recordingDurationBadge: { position: 'absolute', right: 9, bottom: 9, color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 6, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '800' },
  recordingCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0f172a', borderRadius: 26, padding: 14, flexDirection: 'row', gap: 12, shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 14, elevation: 3 },
  timelineRail: { width: 5, borderRadius: 999, backgroundColor: '#f59e0b' },
  recordingBody: { flex: 1, gap: 8 },
  recordingTitle: { color: '#f8fafc', fontWeight: '900', fontSize: 15 },
  rowButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  smallButton: { borderRadius: 999, backgroundColor: '#10b981', paddingHorizontal: 15, paddingVertical: 10 },
  smallButtonText: { color: '#02130f', fontWeight: '900', fontSize: 12 },
  smallButtonDark: { borderRadius: 999, backgroundColor: '#111827', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 15, paddingVertical: 10 },
  smallButtonDarkText: { color: '#e2e8f0', fontWeight: '900', fontSize: 12 },
  emptyCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#0f172a', borderRadius: 28, padding: 24, alignItems: 'center' },
  emptyTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '900' },
  emptyText: { color: '#94a3b8', textAlign: 'center', marginTop: 6, lineHeight: 18 },

  profileScreenTitle: { color: '#ffffff', fontSize: 25, fontWeight: '900', marginBottom: 6 },
  profileSimpleCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#0f172a', borderRadius: 28, borderWidth: 1, borderColor: '#1e293b', padding: 18, marginBottom: 8 },
  profileSimpleAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  profileSimpleName: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  profileSimplePlan: { color: '#34d399', fontSize: 12, fontWeight: '700', marginTop: 3 },
  settingsList: { gap: 12 },
  settingsRow: { backgroundColor: '#0f172a', borderRadius: 18, borderWidth: 1, borderColor: '#1e293b', padding: 16 },
  settingsRowText: { color: '#cbd5e1', fontSize: 14, fontWeight: '700' },
  profileCard: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 34, padding: 24, alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 24, elevation: 7 },
  avatar: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center', shadowColor: '#34d399', shadowOpacity: 0.3, shadowRadius: 18, elevation: 6 },
  avatarText: { color: '#02130f', fontSize: 30, fontWeight: '900' },
  profileName: { color: '#f8fafc', fontSize: 24, fontWeight: '900', marginTop: 4 },
  profileMeta: { color: '#94a3b8', fontSize: 13 },
  profileInfo: { width: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 21, padding: 14, marginTop: 4, backgroundColor: '#111827' },
  infoLabel: { color: '#64748b', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  infoValue: { color: '#e2e8f0', fontSize: 13, fontWeight: '800', marginTop: 4 },
  logoutButton: { width: '100%', height: 54, borderRadius: 20, backgroundColor: 'rgba(244,63,94,0.14)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.30)', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  logoutText: { color: '#fda4af', fontSize: 14, fontWeight: '900' },
  tabs: { position: 'absolute', left: 0, right: 0, bottom: 0, height: BOTTOM_SAFE + 78, backgroundColor: 'rgba(2,6,23,0.94)', borderTopWidth: 1, borderColor: '#1e293b', paddingHorizontal: 12, paddingTop: 9, paddingBottom: BOTTOM_SAFE + 8, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', gap: 4, shadowColor: '#000', shadowOpacity: 0.62, shadowRadius: 28, elevation: 24 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 4 },
  tabActive: { backgroundColor: 'transparent' },
  tabIcon: { color: '#64748b', fontSize: 18, fontWeight: '900', lineHeight: 20 },
  tabIconActive: { color: '#34d399' },
  tabText: { color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: 0.35 },
  tabTextActive: { color: '#34d399' },
});
