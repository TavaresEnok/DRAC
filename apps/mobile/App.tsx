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
type Tab = 'dashboard' | 'live' | 'playback' | 'profile';

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
  return value.trim().replace(/\/+$/, '');
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

function LiveVideo({ uri }: { uri: string | null }) {
  const player = useVideoPlayer(uri ? { uri } : null, (instance) => {
    instance.loop = true;
    if (uri) instance.play();
  });

  if (!uri) {
    return (
      <View style={[styles.video, styles.videoEmpty]}>
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
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [relays, setRelays] = useState<Record<string, RelayDiscovery>>({});
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
        setSession(stored);
        setApiUrl(stored.apiUrl);
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
      setStreamUrls((current) => ({ ...current, [cameraId]: data.protocols?.hlsUrl ?? null }));
    } catch {
      setStreamUrls((current) => ({ ...current, [cameraId]: null }));
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
    try {
      await request(session.apiUrl, `/ptz/${selectedCamera.id}/move`, session.token, {
        method: 'POST',
        body: JSON.stringify({ action: 'step', direction, durationMs: 450, speed: 5 }),
      });
    } catch (error) {
      Alert.alert('PTZ', error instanceof Error ? error.message : 'Comando nao aceito.');
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
      const url = `${session.apiUrl}/recordings/${recording.id}/play?token=${encodeURIComponent(data.playToken)}&compatible=1`;
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Playback', error instanceof Error ? error.message : 'Nao foi possivel abrir a gravacao.');
    }
  };

  const downloadRecording = async (recording: Recording) => {
    if (!session) return;
    try {
      const target = `${FileSystem.documentDirectory}${recording.id}.mp4`;
      const result = await FileSystem.downloadAsync(`${session.apiUrl}/recordings/${recording.id}/download`, target, {
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
        <StatusBar style="dark" />
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
      <StatusBar style="dark" />
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
                <Text style={styles.heroEyebrow}>Operacao ao vivo</Text>
                <Text style={styles.heroTitle}>{onlineCount}/{cameras.length} cameras online</Text>
                <Text style={styles.heroSubtitle}>Somente cameras liberadas para o seu usuario aparecem aqui.</Text>
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
                      <Text style={styles.cameraPreviewText}>LIVE</Text>
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
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Ao vivo</Text>
                <Text style={styles.sectionSubtitle}>Grid mobile e controle rapido da camera selecionada.</Text>
              </View>
              <View style={styles.segmented}>
                {GRID_OPTIONS.map((size) => (
                  <Chip key={size} label={`${size}`} active={gridSize === size} onPress={() => setGridSize(size)} />
                ))}
              </View>
            </View>

            <View style={styles.grid}>
              {visibleGridCameras.map((camera) => (
                <Pressable
                  key={camera.id}
                  onPress={() => setSelectedCameraId(camera.id)}
                  style={[styles.gridTile, selectedCamera?.id === camera.id && styles.gridTileActive]}
                >
                  <View style={styles.videoFrame}>
                    <LiveVideo uri={streamUrls[camera.id] ?? null} />
                    <View style={styles.videoOverlayTop}>
                      <Text style={styles.videoOverlayTitle}>{camera.name}</Text>
                      <Text style={styles.videoProtocol}>HLS</Text>
                    </View>
                  </View>
                  <View style={styles.tileFooter}>
                    <Text style={styles.tileTitle}>{camera.ip}</Text>
                    <Text style={styles.tileMeta}>{formatResolution(camera)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            {selectedCamera ? (
              <View style={styles.controlCard}>
                <View style={styles.controlHeader}>
                  <View>
                    <Text style={styles.panelTitle}>{selectedCamera.name}</Text>
                    <Text style={styles.cameraMeta}>{selectedCamera.group?.name ?? 'Sem grupo'} - {formatResolution(selectedCamera)}</Text>
                  </View>
                  <View style={[styles.statusPill, isOnline(selectedCamera) ? styles.statusOnline : styles.statusOffline]}>
                    <Text style={[styles.statusText, isOnline(selectedCamera) ? styles.statusTextOnline : styles.statusTextOffline]}>{selectedCamera.status}</Text>
                  </View>
                </View>

                <View style={styles.actionGrid}>
                  <ActionPill label="Gravar" tone="danger" disabled={!selectedCamera.canRecord} onPress={() => toggleRecording(selectedCamera, true)} />
                  <ActionPill label="Parar" tone="success" disabled={!selectedCamera.canRecord} onPress={() => toggleRecording(selectedCamera, false)} />
                  <ActionPill label="Alarme" disabled={!relays[selectedCamera.id]?.triggerable} onPress={triggerRelay} />
                </View>

                <View style={styles.ptzCard}>
                  <View style={styles.ptzHeader}>
                    <Text style={styles.ptzTitle}>Controle PTZ</Text>
                    <Text style={styles.ptzSubtitle}>{selectedCamera.canControl ? 'Disponivel' : 'Sem permissao'}</Text>
                  </View>
                  <View style={styles.ptzPad}>
                    <View style={styles.ptzSpacer} />
                    <Pressable disabled={!selectedCamera.canControl} onPress={() => sendPtz('Up')} style={[styles.ptzButton, !selectedCamera.canControl && styles.disabled]}><Text style={styles.ptzText}>UP</Text></Pressable>
                    <View style={styles.ptzSpacer} />
                    <Pressable disabled={!selectedCamera.canControl} onPress={() => sendPtz('Left')} style={[styles.ptzButton, !selectedCamera.canControl && styles.disabled]}><Text style={styles.ptzText}>LEFT</Text></Pressable>
                    <View style={styles.ptzCenter}><Text style={styles.ptzCenterText}>PTZ</Text></View>
                    <Pressable disabled={!selectedCamera.canControl} onPress={() => sendPtz('Right')} style={[styles.ptzButton, !selectedCamera.canControl && styles.disabled]}><Text style={styles.ptzText}>RIGHT</Text></Pressable>
                    <View style={styles.ptzSpacer} />
                    <Pressable disabled={!selectedCamera.canControl} onPress={() => sendPtz('Down')} style={[styles.ptzButton, !selectedCamera.canControl && styles.disabled]}><Text style={styles.ptzText}>DOWN</Text></Pressable>
                    <View style={styles.ptzSpacer} />
                  </View>
                  <View style={styles.zoomRow}>
                    <ActionPill label="Zoom -" disabled={!selectedCamera.canControl} onPress={() => sendPtz('ZoomOut')} />
                    <ActionPill label="Zoom +" disabled={!selectedCamera.canControl} onPress={() => sendPtz('ZoomIn')} />
                  </View>
                </View>
              </View>
            ) : null}
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
        {(['dashboard', 'live', 'playback', 'profile'] as Tab[]).map((item) => (
          <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}>
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === 'dashboard' ? 'Painel' : item === 'live' ? 'Ao vivo' : item === 'playback' ? 'Playback' : 'Perfil'}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f1eb' },
  loginScreen: { flex: 1 },
  loginSafe: { flex: 1, justifyContent: 'space-between', padding: 20, paddingTop: 64, paddingBottom: 28 },
  loginHero: { gap: 10 },
  logoMark: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#1f2b24', alignItems: 'center', justifyContent: 'center', shadowColor: '#182018', shadowOpacity: 0.24, shadowRadius: 20, elevation: 7 },
  logoLens: { width: 34, height: 34, borderRadius: 17, borderWidth: 8, borderColor: '#9cc6a2', backgroundColor: '#101510' },
  loginBrand: { color: '#182018', fontSize: 16, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase', marginTop: 8 },
  loginTitle: { color: '#182018', fontSize: 36, lineHeight: 40, fontWeight: '900', maxWidth: 320 },
  loginSubtitle: { color: '#5f6259', fontSize: 15, lineHeight: 22, maxWidth: 340 },
  loginCard: { backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: 'rgba(24,32,24,0.08)', borderRadius: 28, padding: 18, gap: 8, shadowColor: '#303426', shadowOpacity: 0.16, shadowRadius: 22, elevation: 9 },
  formLabel: { color: '#68665c', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, marginLeft: 2, marginTop: 4 },
  input: { height: 50, borderWidth: 1, borderColor: '#d6d0c4', backgroundColor: '#fbfaf6', borderRadius: 16, paddingHorizontal: 14, color: '#1d211c', fontSize: 14 },
  primaryButton: { height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1f2b24', marginTop: 8 },
  primaryButtonText: { color: '#f7f3ea', fontWeight: '900', fontSize: 14 },
  topBar: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderColor: '#e4ded2', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f4f1eb' },
  appName: { color: '#1b211c', fontSize: 24, fontWeight: '900', letterSpacing: 0.2 },
  headerMeta: { color: '#77756c', fontSize: 12, marginTop: 2 },
  refreshButton: { borderWidth: 1, borderColor: '#d7d0c2', backgroundColor: '#fffdf8', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  refreshText: { color: '#20261f', fontSize: 12, fontWeight: '900' },
  content: { padding: 16, paddingBottom: 96 },
  page: { gap: 14 },
  heroCard: { borderRadius: 28, padding: 20, minHeight: 150, justifyContent: 'space-between', overflow: 'hidden' },
  heroEyebrow: { color: '#aab9a4', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
  heroTitle: { color: '#fbfaf6', fontSize: 28, fontWeight: '900', marginTop: 8 },
  heroSubtitle: { color: '#c9d1c5', fontSize: 13, marginTop: 6, lineHeight: 19, maxWidth: 280 },
  heroDot: { position: 'absolute', right: -30, bottom: -38, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(156,198,162,0.18)' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, borderWidth: 1, borderColor: '#e0d9ce', backgroundColor: '#fffdf8', borderRadius: 22, padding: 14 },
  metricValue: { color: '#1d211c', fontSize: 24, fontWeight: '900' },
  metricLabel: { color: '#7c786f', fontSize: 11, fontWeight: '800', marginTop: 2 },
  groupBlock: { gap: 10, marginTop: 4 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupTitle: { color: '#282d27', fontSize: 14, fontWeight: '900' },
  groupCount: { color: '#8b857b', fontSize: 12, fontWeight: '800' },
  cameraCard: { borderWidth: 1, borderColor: '#e0d9ce', backgroundColor: '#fffdf8', borderRadius: 24, padding: 10, flexDirection: 'row', gap: 12, shadowColor: '#8f8878', shadowOpacity: 0.08, shadowRadius: 12, elevation: 2 },
  cameraPreview: { width: 96, minHeight: 86, borderRadius: 18, backgroundColor: '#182018', alignItems: 'center', justifyContent: 'center' },
  cameraPreviewText: { color: '#9cc6a2', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  cameraCardBody: { flex: 1, gap: 4, justifyContent: 'center' },
  cameraCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cameraName: { color: '#20251f', fontWeight: '900', fontSize: 15, flexShrink: 1 },
  cameraMeta: { color: '#77756c', fontSize: 12, marginTop: 2 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  statusOnline: { backgroundColor: '#edf8ed', borderColor: '#bcd9bd' },
  statusOffline: { backgroundColor: '#f8eeee', borderColor: '#e0c3c3' },
  statusText: { fontSize: 9, fontWeight: '900' },
  statusTextOnline: { color: '#326a3a' },
  statusTextOffline: { color: '#8a3b3b' },
  permissionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  permissionBadge: { color: '#4f594d', backgroundColor: '#f0eadf', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, fontWeight: '900' },
  sectionHeader: { gap: 10 },
  sectionTitle: { color: '#20251f', fontSize: 24, fontWeight: '900' },
  sectionSubtitle: { color: '#77756c', fontSize: 13, marginTop: 2 },
  segmented: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#d7d0c2', backgroundColor: '#fffdf8', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: '#1f2b24', borderColor: '#1f2b24' },
  chipText: { color: '#55584f', fontWeight: '900', fontSize: 12 },
  chipTextActive: { color: '#f7f3ea' },
  grid: { gap: 12 },
  gridTile: { borderWidth: 1, borderColor: '#e0d9ce', backgroundColor: '#fffdf8', borderRadius: 24, overflow: 'hidden' },
  gridTileActive: { borderColor: '#1f2b24', borderWidth: 2 },
  videoFrame: { position: 'relative', backgroundColor: '#090b0a' },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#070807' },
  videoEmpty: { alignItems: 'center', justifyContent: 'center', padding: 18 },
  videoEmptyTitle: { color: '#f4efe6', fontSize: 14, fontWeight: '900' },
  videoEmptyText: { color: '#969286', fontSize: 12, marginTop: 4, textAlign: 'center' },
  videoOverlayTop: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', pointerEvents: 'none' },
  videoOverlayTitle: { color: '#fffdf8', fontSize: 12, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  videoProtocol: { color: '#182018', fontSize: 10, fontWeight: '900', backgroundColor: '#9cc6a2', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  tileFooter: { padding: 12 },
  tileTitle: { color: '#20251f', fontWeight: '900', fontSize: 13 },
  tileMeta: { color: '#77756c', fontSize: 11, marginTop: 2 },
  controlCard: { borderWidth: 1, borderColor: '#e0d9ce', backgroundColor: '#fffdf8', borderRadius: 28, padding: 14, gap: 14 },
  controlHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  panelTitle: { color: '#20251f', fontWeight: '900', fontSize: 17 },
  actionGrid: { flexDirection: 'row', gap: 8 },
  actionPill: { flex: 1, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  actionPill_neutral: { borderColor: '#d8d0c3', backgroundColor: '#f7f2e9' },
  actionPill_danger: { borderColor: '#e3b9b0', backgroundColor: '#fff0ed' },
  actionPill_success: { borderColor: '#b8d8b9', backgroundColor: '#edf8ed' },
  actionPillText: { fontWeight: '900', fontSize: 12 },
  actionPillText_neutral: { color: '#343932' },
  actionPillText_danger: { color: '#a3392c' },
  actionPillText_success: { color: '#2e6c39' },
  disabled: { opacity: 0.36 },
  ptzCard: { backgroundColor: '#f3eee5', borderRadius: 24, padding: 14, gap: 14 },
  ptzHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ptzTitle: { color: '#20251f', fontWeight: '900', fontSize: 14 },
  ptzSubtitle: { color: '#7b766c', fontSize: 12, fontWeight: '800' },
  ptzPad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ptzButton: { width: '30%', minHeight: 54, borderWidth: 1, borderColor: '#d2cabd', borderRadius: 18, backgroundColor: '#fffdf8', alignItems: 'center', justifyContent: 'center' },
  ptzCenter: { width: '30%', minHeight: 54, borderRadius: 18, backgroundColor: '#1f2b24', alignItems: 'center', justifyContent: 'center' },
  ptzText: { color: '#252a24', fontWeight: '900', fontSize: 11 },
  ptzCenterText: { color: '#9cc6a2', fontWeight: '900', fontSize: 12 },
  ptzSpacer: { width: '30%', minHeight: 54 },
  zoomRow: { flexDirection: 'row', gap: 8 },
  cameraChips: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  timeline: { gap: 10 },
  recordingCard: { borderWidth: 1, borderColor: '#e0d9ce', backgroundColor: '#fffdf8', borderRadius: 22, padding: 12, flexDirection: 'row', gap: 12 },
  timelineRail: { width: 4, borderRadius: 999, backgroundColor: '#9cc6a2' },
  recordingBody: { flex: 1, gap: 8 },
  recordingTitle: { color: '#20251f', fontWeight: '900', fontSize: 15 },
  rowButtons: { flexDirection: 'row', gap: 8 },
  smallButton: { borderRadius: 14, backgroundColor: '#1f2b24', paddingHorizontal: 14, paddingVertical: 10 },
  smallButtonText: { color: '#f7f3ea', fontWeight: '900', fontSize: 12 },
  smallButtonDark: { borderRadius: 14, backgroundColor: '#ede7dc', paddingHorizontal: 14, paddingVertical: 10 },
  smallButtonDarkText: { color: '#252a24', fontWeight: '900', fontSize: 12 },
  emptyCard: { borderWidth: 1, borderColor: '#e0d9ce', backgroundColor: '#fffdf8', borderRadius: 24, padding: 22, alignItems: 'center' },
  emptyTitle: { color: '#20251f', fontSize: 16, fontWeight: '900' },
  emptyText: { color: '#77756c', textAlign: 'center', marginTop: 6, lineHeight: 18 },
  profileCard: { backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#e0d9ce', borderRadius: 28, padding: 20, alignItems: 'center', gap: 10 },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#1f2b24', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#9cc6a2', fontSize: 28, fontWeight: '900' },
  profileName: { color: '#20251f', fontSize: 22, fontWeight: '900', marginTop: 4 },
  profileMeta: { color: '#77756c', fontSize: 13 },
  profileInfo: { width: '100%', borderWidth: 1, borderColor: '#e6dfd3', borderRadius: 18, padding: 12, marginTop: 4 },
  infoLabel: { color: '#8b857b', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  infoValue: { color: '#20251f', fontSize: 13, fontWeight: '800', marginTop: 4 },
  logoutButton: { width: '100%', height: 50, borderRadius: 18, backgroundColor: '#292f29', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  logoutText: { color: '#f7f3ea', fontSize: 14, fontWeight: '900' },
  tabs: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#e0d9ce', borderRadius: 24, padding: 6, flexDirection: 'row', gap: 6, shadowColor: '#423b2f', shadowOpacity: 0.14, shadowRadius: 16, elevation: 8 },
  tab: { flex: 1, alignItems: 'center', borderRadius: 18, paddingVertical: 11 },
  tabActive: { backgroundColor: '#1f2b24' },
  tabText: { color: '#7b766c', fontSize: 11, fontWeight: '900' },
  tabTextActive: { color: '#f7f3ea' },
});
