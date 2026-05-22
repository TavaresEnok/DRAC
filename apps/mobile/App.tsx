import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { DEFAULT_API_URL } from './src/config';
import { BottomTabs } from './src/components/BottomTabs';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { GridScreen } from './src/screens/GridScreen';
import { LiveScreen } from './src/screens/LiveScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { PlaybackScreen } from './src/screens/PlaybackScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { request, normalizeServerUrl } from './src/services/api';
import { cleanApiUrl, clearStoredSession, loadStoredSession, saveStoredSession } from './src/services/sessionStore';
import type { ActivePlayback, Camera, Direction, MosaicArea, Recording, Session, StreamUrls, Tab, User } from './src/types';
import { styles } from './src/styles/appStyles';

const MOSAIC_AREAS_KEY = '@drac:mosaic-areas:v1';

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
  const [streamUrls, setStreamUrls] = useState<Record<string, string | null>>({});
  const [streamPosters, setStreamPosters] = useState<Record<string, string | null>>({});
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activePlayback, setActivePlayback] = useState<ActivePlayback | null>(null);
  const [ptzActive, setPtzActive] = useState<Direction | null>(null);
  const [ptzFeedback, setPtzFeedback] = useState<string | null>(null);
  const [showPtz, setShowPtz] = useState(true);
  const [selectedMosaicGroup, setSelectedMosaicGroup] = useState<string>('all');
  const [mosaicAreas, setMosaicAreas] = useState<MosaicArea[]>([]);
  const [mosaicAreasLoaded, setMosaicAreasLoaded] = useState(false);
  const [recordingDate, setRecordingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const previewLimit = 8;
  const selectedCamera = cameras.find((camera) => camera.id === selectedCameraId) ?? cameras[0] ?? null;

  const groupedCameras = useMemo(() => {
    const map = new Map<string, Camera[]>();
    for (const camera of cameras) {
      const groupName = camera.group?.name ?? 'Sem grupo';
      map.set(groupName, [...(map.get(groupName) ?? []), camera]);
    }
    return Array.from(map.entries());
  }, [cameras]);
  const mosaicCameras = useMemo(() => {
    if (selectedMosaicGroup === 'all') return cameras;
    if (selectedMosaicGroup.startsWith('area:')) {
      const area = mosaicAreas.find((item) => `area:${item.id}` === selectedMosaicGroup);
      if (!area) return cameras;
      return cameras.filter((camera) => area.cameraIds.includes(camera.id));
    }
    if (selectedMosaicGroup.startsWith('group:')) {
      const groupName = selectedMosaicGroup.slice('group:'.length);
      return groupedCameras.find(([name]) => name === groupName)?.[1] ?? cameras;
    }
    return cameras;
  }, [cameras, groupedCameras, mosaicAreas, selectedMosaicGroup]);

  useEffect(() => {
    AsyncStorage.getItem(MOSAIC_AREAS_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as MosaicArea[];
        if (Array.isArray(parsed)) setMosaicAreas(parsed);
      })
      .catch(() => undefined)
      .finally(() => setMosaicAreasLoaded(true));
  }, []);

  useEffect(() => {
    if (!mosaicAreasLoaded) return;
    void AsyncStorage.setItem(MOSAIC_AREAS_KEY, JSON.stringify(mosaicAreas));
  }, [mosaicAreas, mosaicAreasLoaded]);

  useEffect(() => {
    if (!selectedMosaicGroup.startsWith('area:')) return;
    const areaExists = mosaicAreas.some((area) => `area:${area.id}` === selectedMosaicGroup);
    if (!areaExists) setSelectedMosaicGroup('all');
  }, [mosaicAreas, selectedMosaicGroup]);
  useEffect(() => {
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
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (session) void loadAll();
  }, [session?.token]);

  useEffect(() => {
    if (selectedCamera && session) {
      void loadStream(selectedCamera.id);
      void loadRecordings(selectedCamera.id, recordingDate);
    }
  }, [selectedCamera?.id, session?.token, recordingDate]);

  const login = async () => {
    setLoading(true);
    try {
      const nextApiUrl = cleanApiUrl(apiUrl);
      if (!nextApiUrl) throw new Error('Informe a URL da API nas configurações do app.');
      const data = await request<{ accessToken: string; user: User }>(nextApiUrl, '/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const nextSession = { apiUrl: nextApiUrl, token: data.accessToken, user: data.user };
      await saveStoredSession(nextSession);
      setSession(nextSession);
      setPassword('');
    } catch (error) {
      Alert.alert('Falha no login', error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await clearStoredSession();
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
      void Promise.all(data.slice(0, previewLimit).map((camera) => loadStream(camera.id)));
    } catch (error) {
      Alert.alert('Falha ao carregar', error instanceof Error ? error.message : 'Não foi possível carregar câmeras.');
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
      Alert.alert('PTZ', error instanceof Error ? error.message : 'Comando não aceito.');
    } finally {
      setTimeout(() => setPtzActive(null), 220);
    }
  };

  const createMosaicArea = (name: string) => {
    const cleanName = name.trim();
    if (!cleanName) {
      Alert.alert('Mosaico', 'Informe o nome da área.');
      return;
    }
    if (mosaicAreas.some((area) => area.name.toLowerCase() === cleanName.toLowerCase())) {
      Alert.alert('Mosaico', 'Já existe uma área com esse nome.');
      return;
    }
    const nextArea = { id: `${Date.now()}`, name: cleanName, cameraIds: [] };
    setMosaicAreas((current) => [...current, nextArea]);
    setSelectedMosaicGroup(`area:${nextArea.id}`);
  };

  const toggleCameraInMosaicArea = (areaId: string, cameraId: string) => {
    setMosaicAreas((current) => current.map((area) => {
      if (area.id !== areaId) return area;
      const exists = area.cameraIds.includes(cameraId);
      return {
        ...area,
        cameraIds: exists ? area.cameraIds.filter((id) => id !== cameraId) : [...area.cameraIds, cameraId],
      };
    }));
  };

  const deleteMosaicArea = (areaId: string) => {
    setMosaicAreas((current) => current.filter((area) => area.id !== areaId));
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
      Alert.alert('Gravação', error instanceof Error ? error.message : 'Não foi possível alterar a gravação.');
    }
  };

  const openPlayback = async (recording: Recording) => {
    if (!session) return;
    try {
      const data = await request<{ playToken: string }>(session.apiUrl, `/recordings/${recording.id}/play-token`, session.token, { method: 'POST' });
      const url = normalizeServerUrl(`${session.apiUrl}/recordings/${recording.id}/play?token=${encodeURIComponent(data.playToken)}&compatible=1`, session.apiUrl);
      if (!url) throw new Error('URL de playback indisponível.');
      setActivePlayback({ recording, url });
    } catch (error) {
      Alert.alert('Playback', error instanceof Error ? error.message : 'Não foi possível abrir a gravação.');
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

  if (!session) {
    return (
      <LoginScreen
        apiUrl={apiUrl}
        email={email}
        password={password}
        loading={loading}
        onApiUrlChange={setApiUrl}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={login}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />} contentContainerStyle={styles.content}>
        {tab === 'dashboard' && (
          <DashboardScreen
            cameras={cameras}
            groupedCameras={groupedCameras}
            streamPosters={streamPosters}
            previewLimit={previewLimit}
            onOpenCamera={(cameraId) => { setSelectedCameraId(cameraId); setShowPtz(true); setTab('live'); }}
          />
        )}

        {tab === 'live' && (
          <LiveScreen
            selectedCamera={selectedCamera}
            streamUrl={selectedCamera ? streamUrls[selectedCamera.id] ?? null : null}
            posterUrl={selectedCamera ? streamPosters[selectedCamera.id] ?? null : null}
            showPtz={showPtz}
            ptzActive={ptzActive}
            ptzFeedback={ptzFeedback}
            onBack={() => { setTab('dashboard'); setShowPtz(true); }}
            onTogglePtz={() => setShowPtz((value) => !value)}
            onSendPtz={sendPtz}
            onStartRecording={(camera) => toggleRecording(camera, true)}
          />
        )}

        {tab === 'grid' && (
          <GridScreen
            groupedCameras={groupedCameras}
            cameras={cameras}
            mosaicCameras={mosaicCameras}
            mosaicAreas={mosaicAreas}
            streamPosters={streamPosters}
            selectedMosaicGroup={selectedMosaicGroup}
            onSelectGroup={setSelectedMosaicGroup}
            onCreateArea={createMosaicArea}
            onDeleteArea={deleteMosaicArea}
            onToggleCameraInArea={toggleCameraInMosaicArea}
            onOpenCamera={(cameraId) => { setSelectedCameraId(cameraId); setShowPtz(true); setTab('live'); }}
          />
        )}

        {tab === 'playback' && (
          <PlaybackScreen
            cameras={cameras}
            selectedCamera={selectedCamera}
            streamPosters={streamPosters}
            recordings={recordings}
            activePlayback={activePlayback}
            onSelectCamera={(cameraId) => {
              setSelectedCameraId(cameraId);
              setActivePlayback(null);
              void loadRecordings(cameraId, recordingDate);
            }}
            onOpenPlayback={openPlayback}
            onClosePlayback={() => setActivePlayback(null)}
            onDownloadRecording={downloadRecording}
            recordingDate={recordingDate}
            onPreviousDate={() => shiftRecordingDate(-1)}
            onNextDate={() => shiftRecordingDate(1)}
          />
        )}

        {tab === 'profile' && (
          <ProfileScreen session={session} onLogout={logout} />
        )}
      </ScrollView>

      {tab !== 'live' ? <BottomTabs activeTab={tab} onChange={setTab} /> : null}
    </SafeAreaView>
  );
}
