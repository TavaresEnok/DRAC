import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BOTTOM_SAFE, DEFAULT_API_URL, TOP_SAFE } from './src/config';
import { BottomTabs } from './src/components/BottomTabs';
import { PtzButton } from './src/components/PtzButton';
import { SvgIcon } from './src/components/SvgIcon';
import { LiveVideo, PlaybackVideo } from './src/components/VideoPlayers';
import { LoginScreen } from './src/screens/LoginScreen';
import { request, normalizeServerUrl } from './src/services/api';
import { cleanApiUrl, clearStoredSession, loadStoredSession, saveStoredSession } from './src/services/sessionStore';
import type { ActivePlayback, Camera, Direction, Recording, Session, StreamUrls, Tab, User } from './src/types';
import { formatBytes, formatDuration, formatResolution, formatTime, isOnline } from './src/utils/format';

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
  const [selectedMosaicGroup, setSelectedMosaicGroup] = useState<string>('Todas');
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
    if (selectedMosaicGroup === 'Todas') return cameras;
    return groupedCameras.find(([groupName]) => groupName === selectedMosaicGroup)?.[1] ?? cameras;
  }, [cameras, groupedCameras, selectedMosaicGroup]);
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
      void loadRecordings(selectedCamera.id);
    }
  }, [selectedCamera?.id, session?.token]);

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
      Alert.alert('PTZ', error instanceof Error ? error.message : 'Comando não aceito.');
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
          <View style={styles.page}>
            <View style={styles.dashboardHeader}>
              <View>
                <Text style={styles.dashboardTitle}>Câmeras</Text>
                <Text style={styles.dashboardSubtitle}>Acesso filtrado pelo seu grupo</Text>
                {cameras.length > previewLimit ? (
                  <Text style={styles.previewLimitHint}>
                    Pré-visualização carregada para as primeiras {previewLimit} câmeras.
                  </Text>
                ) : null}
              </View>
            </View>

            {groupedCameras.map(([groupName, items]) => (
              <View key={groupName} style={styles.groupBlock}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{groupName}</Text>
                  <Text style={styles.groupCount}>{items.length} câmeras</Text>
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
                          {isOnline(camera) ? 'ONLINE' : 'OFF'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.cameraCardBody}>
                      <View style={styles.cameraCardTop}>
                        <Text style={styles.cameraName}>{camera.name}</Text>
                        <View style={styles.cardPlayButton}><SvgIcon name="play" size={18} color="#34d399" /></View>
                      </View>
                      <Text style={styles.cameraMeta}>{formatResolution(camera)}</Text>
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
                  <View style={[styles.headerIconButton, styles.disabled]}>
                    <SvgIcon name="settings" size={23} color="#64748b" />
                  </View>
                </View>

                <View style={styles.singleVideoCard}>
                  <LiveVideo
                    uri={streamUrls[selectedCamera.id] ?? null}
                    posterUri={streamPosters[selectedCamera.id] ?? null}
                    videoStyle={styles.video}
                    emptyStyle={styles.videoEmpty}
                    posterStyle={styles.videoPoster}
                    emptyTitleStyle={styles.videoEmptyTitle}
                    emptyTextStyle={styles.videoEmptyText}
                  />
                  <View style={styles.singleVideoTopOverlay}>
                    <Text style={styles.liveNowText}>AO VIVO</Text>
                    <Text style={styles.videoProtocol}>HLS</Text>
                  </View>
                </View>

                <View style={styles.quickActionsGrid}>
                  <Pressable disabled style={[styles.quickActionButton, styles.disabled]}>
                    <View style={styles.quickActionIcon}><SvgIcon name="mic" color="#cbd5e1" /></View>
                    <Text style={styles.quickActionLabel}>Falar</Text>
                    <Text style={styles.quickActionSoon}>Em breve</Text>
                  </Pressable>
                  <Pressable disabled style={[styles.quickActionButton, styles.disabled]}>
                    <View style={styles.quickActionIcon}><SvgIcon name="camera" color="#cbd5e1" /></View>
                    <Text style={styles.quickActionLabel}>Foto</Text>
                    <Text style={styles.quickActionSoon}>Em breve</Text>
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
                        <PtzButton label="⌃" direction="Up" disabled={!selectedCamera.canControl} active={ptzActive === 'Up'} onPress={sendPtz} style={styles.ptzUp} buttonStyle={styles.ptzRoundButton} activeButtonStyle={styles.ptzRoundButtonActive} disabledStyle={styles.disabled} textStyle={styles.ptzRoundText} activeTextStyle={styles.ptzRoundTextActive} />
                        <PtzButton label="⌄" direction="Down" disabled={!selectedCamera.canControl} active={ptzActive === 'Down'} onPress={sendPtz} style={styles.ptzDown} buttonStyle={styles.ptzRoundButton} activeButtonStyle={styles.ptzRoundButtonActive} disabledStyle={styles.disabled} textStyle={styles.ptzRoundText} activeTextStyle={styles.ptzRoundTextActive} />
                        <PtzButton label="‹" direction="Left" disabled={!selectedCamera.canControl} active={ptzActive === 'Left'} onPress={sendPtz} style={styles.ptzLeft} buttonStyle={styles.ptzRoundButton} activeButtonStyle={styles.ptzRoundButtonActive} disabledStyle={styles.disabled} textStyle={styles.ptzRoundText} activeTextStyle={styles.ptzRoundTextActive} />
                        <PtzButton label="›" direction="Right" disabled={!selectedCamera.canControl} active={ptzActive === 'Right'} onPress={sendPtz} style={styles.ptzRight} buttonStyle={styles.ptzRoundButton} activeButtonStyle={styles.ptzRoundButtonActive} disabledStyle={styles.disabled} textStyle={styles.ptzRoundText} activeTextStyle={styles.ptzRoundTextActive} />
                        <View style={styles.ptzNub}><View style={styles.ptzNubInner} /></View>
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Selecione uma câmera</Text>
                <Text style={styles.emptyText}>Volte em Câmeras e toque em uma câmera para abrir o ao vivo.</Text>
              </View>
            )}
          </View>
        )}

        {tab === 'grid' && (
          <View style={styles.page}>
            <View style={styles.mosaicHeader}>
              <Text style={styles.mosaicTitle}>Mosaico</Text>
              <Pressable disabled style={[styles.editLayoutButton, styles.disabled]}>
                <Text style={styles.editLayoutText}>Editar Layout</Text>
                <Text style={styles.editLayoutSoon}>Em breve</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupFilterRow}>
              {['Todas', ...groupedCameras.map(([groupName]) => groupName)].map((groupName) => (
                <Pressable
                  key={groupName}
                  onPress={() => setSelectedMosaicGroup(groupName)}
                  style={[styles.groupFilterChip, selectedMosaicGroup === groupName && styles.groupFilterChipActive]}
                >
                  <Text style={[styles.groupFilterText, selectedMosaicGroup === groupName && styles.groupFilterTextActive]}>{groupName}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.mosaicGrid}>
              {mosaicCameras.map((camera) => (
                <Pressable
                  key={camera.id}
                  onPress={() => { setSelectedCameraId(camera.id); setShowPtz(true); setTab('live'); }}
                  style={styles.mosaicTile}
                >
                  {streamPosters[camera.id] ? (
                    <Image source={{ uri: streamPosters[camera.id] ?? undefined }} style={styles.mosaicImage} />
                  ) : (
                    <View style={styles.mosaicFallback}><Text style={styles.mosaicFallbackText}>DRAC</Text></View>
                  )}
                  <View style={styles.mosaicShade} />
                  <View style={[styles.mosaicStatus, isOnline(camera) ? styles.mosaicStatusOnline : styles.mosaicStatusOffline]} />
                  <View style={styles.mosaicFooter}><Text style={styles.mosaicCameraName}>{camera.name}</Text></View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {tab === 'playback' && (
          <View style={styles.page}>
            <View>
              <Text style={styles.recordingsTitle}>Gravações</Text>
              <Text style={styles.recordingsSubtitle}>Selecione uma câmera para ver os arquivos salvos e histórico.</Text>
            </View>

            <View style={styles.recordingCameraList}>
              {cameras.map((camera) => (
                <Pressable
                  key={camera.id}
                  onPress={() => {
                    setSelectedCameraId(camera.id);
                    setActivePlayback(null);
                    void loadRecordings(camera.id);
                  }}
                  style={[styles.recordingCameraCard, selectedCamera?.id === camera.id && styles.recordingCameraCardActive]}
                >
                  <View style={styles.recordingCameraThumb}>
                    {streamPosters[camera.id] ? <Image source={{ uri: streamPosters[camera.id] ?? undefined }} style={styles.recordingCameraImage} /> : <SvgIcon name="camera" size={24} color="#475569" />}
                    {camera.canRecord ? <View style={styles.recordDot} /> : null}
                  </View>
                  <View style={styles.recordingCameraBody}>
                    <Text style={styles.recordingCameraTitle}>{camera.name}</Text>
                    <Text style={styles.recordingCameraMeta}>{camera.group?.name ?? 'Sem grupo'}</Text>
                    <View style={styles.recordingCameraHistory}>
                      <SvgIcon name="calendar" size={12} color="#34d399" />
                      <Text style={styles.recordingCameraHistoryText}>Ver Histórico</Text>
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
                <PlaybackVideo uri={activePlayback.url} style={styles.playbackVideo} />
                <View style={styles.rowButtons}>
                  <Pressable onPress={() => downloadRecording(activePlayback.recording)} style={styles.smallButton}>
                    <Text style={styles.smallButtonText}>Baixar esta gravação</Text>
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
                <Text style={styles.emptyTitle}>Sem gravações hoje</Text>
                <Text style={styles.emptyText}>Troque a câmera acima ou atualize para buscar novos segmentos.</Text>
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
              {['Gerenciar Dispositivos', 'Armazenamento em Nuvem', 'Notificações', 'Ajuda e Suporte'].map((item) => (
                <View key={item} style={[styles.settingsRow, styles.settingsRowDisabled]}>
                  <Text style={styles.settingsRowText}>{item}</Text>
                  <Text style={styles.settingsSoonText}>Em breve</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={logout} style={styles.logoutButton}><Text style={styles.logoutText}>Sair do app</Text></Pressable>
          </View>
        )}
      </ScrollView>

      {tab !== 'live' ? <BottomTabs activeTab={tab} onChange={setTab} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020617' },
  content: { padding: 16, paddingTop: TOP_SAFE + 24, paddingBottom: BOTTOM_SAFE + 118, backgroundColor: '#020617' },
  page: { gap: 18 },
  dashboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  dashboardTitle: { color: '#ffffff', fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  dashboardSubtitle: { color: '#94a3b8', fontSize: 14, marginTop: 4, fontWeight: '600' },
  previewLimitHint: { color: '#64748b', fontSize: 11, lineHeight: 16, marginTop: 6, fontWeight: '700' },


  groupBlock: { gap: 13, marginTop: 4 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 3 },
  groupTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '900' },
  groupCount: { color: '#64748b', fontSize: 12, fontWeight: '800' },
  cameraCard: { height: 218, borderRadius: 28, overflow: 'hidden', backgroundColor: '#0f172a', borderWidth: 1, borderColor: 'rgba(30,41,59,0.86)', shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 18, elevation: 6 },
  cameraPreview: { position: 'absolute', left: 0, right: 0, top: 0, height: 160, backgroundColor: '#1e293b', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
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
  cameraCardBody: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 58, zIndex: 5, gap: 2, backgroundColor: '#0f172a', borderTopWidth: 1, borderColor: 'rgba(30,41,59,0.72)', paddingHorizontal: 18, paddingVertical: 9 },
  cameraCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cameraName: { color: '#ffffff', fontWeight: '900', fontSize: 16, flexShrink: 1, letterSpacing: 0.1 },
  cameraMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2, fontWeight: '600' },
  cardPlayButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },


  videoPoster: { position: 'absolute', width: '100%', aspectRatio: 16 / 9, resizeMode: 'cover', opacity: 0.72 },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000000' },
  videoEmpty: { alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: '#020617' },
  videoEmptyTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '900' },
  videoEmptyText: { color: '#94a3b8', fontSize: 12, marginTop: 4, textAlign: 'center' },
  videoProtocol: { color: '#02130f', fontSize: 10, fontWeight: '900', backgroundColor: '#34d399', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },

  disabled: { opacity: 0.36 },

  cameraStage: { gap: 16 },
  cameraDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 2 },
  headerIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cameraDetailTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  cameraDetailSubtitle: { color: '#34d399', fontSize: 10, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.1, marginTop: 3 },
  singleVideoCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#000000', borderRadius: 32, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 28, elevation: 10 },
  singleVideoTopOverlay: { position: 'absolute', left: 12, right: 12, top: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveNowText: { color: '#d1fae5', fontSize: 11, fontWeight: '900', letterSpacing: 1.3, backgroundColor: 'rgba(0,0,0,0.64)', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  quickActionsGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginVertical: 6 },
  quickActionButton: { flex: 1, alignItems: 'center', gap: 8 },
  quickActionIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  quickActionIconActive: { backgroundColor: '#10b981', borderColor: '#10b981', shadowColor: '#10b981', shadowOpacity: 0.32, shadowRadius: 15, elevation: 7 },
  quickActionLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  quickActionSoon: { color: '#64748b', fontSize: 9, fontWeight: '800', marginTop: -5 },
  ptzCardPremium: { backgroundColor: 'transparent', borderRadius: 0, padding: 0, gap: 18, borderWidth: 0 },
  ptzFeedback: { color: '#02130f', backgroundColor: '#34d399', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontSize: 10, fontWeight: '900' },
  ptzConsole: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: '#0f172a', borderRadius: 32, borderWidth: 1, borderColor: 'rgba(30,41,59,0.9)', paddingVertical: 24, paddingHorizontal: 10, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 22, elevation: 8 },
  ptzDpad: { width: 224, height: 224, borderRadius: 112, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b', position: 'relative', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.52, shadowRadius: 24, elevation: 10 },
  ptzRoundButton: { position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: 'transparent', borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  ptzRoundButtonActive: { backgroundColor: '#10b981', transform: [{ scale: 0.9 }] },
  ptzRoundText: { color: '#64748b', fontSize: 32, fontWeight: '900' },
  ptzRoundTextActive: { color: '#02130f' },
  ptzUp: { top: 12, left: 88 },
  ptzLeft: { left: 12, top: 88 },
  ptzRight: { right: 12, top: 88 },
  ptzDown: { bottom: 12, left: 88 },
  ptzNub: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1e293b', borderWidth: 4, borderColor: '#334155', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 16, elevation: 5 },
  ptzNubInner: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(51,65,85,0.52)' },
  mosaicHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 4 },
  mosaicTitle: { color: '#ffffff', fontSize: 25, fontWeight: '900' },
  editLayoutButton: { borderWidth: 1, borderColor: 'rgba(52,211,153,0.24)', backgroundColor: 'rgba(16,185,129,0.10)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  editLayoutText: { color: '#34d399', fontSize: 13, fontWeight: '800' },
  editLayoutSoon: { color: '#64748b', fontSize: 9, fontWeight: '800', marginTop: 1 },
  groupFilterRow: { gap: 9, paddingRight: 16, paddingBottom: 2 },
  groupFilterChip: { borderWidth: 1, borderColor: '#1e293b', backgroundColor: '#0f172a', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  groupFilterChipActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  groupFilterText: { color: '#94a3b8', fontSize: 12, fontWeight: '900' },
  groupFilterTextActive: { color: '#02130f' },
  mosaicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mosaicTile: { width: '48.55%', aspectRatio: 1, backgroundColor: '#0f172a', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(30,41,59,0.86)', shadowColor: '#000', shadowOpacity: 0.34, shadowRadius: 14, elevation: 4 },
  mosaicImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.84 },
  mosaicFallback: { position: 'absolute', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  mosaicFallbackText: { color: '#34d399', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  mosaicShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,6,23,0.18)' },
  mosaicStatus: { position: 'absolute', right: 10, top: 10, width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(2,6,23,0.8)' },
  mosaicStatusOnline: { backgroundColor: '#34d399' },
  mosaicStatusOffline: { backgroundColor: '#fb7185' },
  mosaicFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 28, paddingBottom: 10, backgroundColor: 'rgba(2,6,23,0.62)' },
  mosaicCameraName: { color: '#ffffff', fontSize: 12, fontWeight: '800' },

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
  settingsRowDisabled: { opacity: 0.54 },
  settingsRowText: { color: '#cbd5e1', fontSize: 14, fontWeight: '700' },
  settingsSoonText: { color: '#64748b', fontSize: 11, fontWeight: '800', marginTop: 5 },
  logoutButton: { width: '100%', height: 54, borderRadius: 20, backgroundColor: 'rgba(244,63,94,0.14)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.30)', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  logoutText: { color: '#fda4af', fontSize: 14, fontWeight: '900' },
});
