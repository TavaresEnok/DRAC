/**
 * Dados mock apenas para o mockup de UI.
 * A IA de produção substitui por chamadas reais (ver apps/mobile/src/services/api.ts).
 */
import type { AlarmEvent, Camera, CameraGroup, RecordingItem, UserInfo } from '../types';

export const mockUser: UserInfo = {
  name: 'Enok Tavares',
  email: 'enok@drac.io',
  role: 'ADMIN',
  initials: 'EN',
};

export const mockCameras: Camera[] = [
  { id: 'c1', name: 'Entrada Principal', area: '1º andar', status: 'ONLINE', recording: true, resolution: '1080p', tint: ['#1f2937', '#0f172a'] },
  { id: 'c2', name: 'Recepção', area: '1º andar', status: 'ONLINE', recording: true, resolution: '1080p', tint: ['#2b2733', '#13111a'] },
  { id: 'c3', name: 'Corredor A', area: '1º andar', status: 'ONLINE', recording: false, resolution: '720p', tint: ['#243044', '#101826'] },
  { id: 'c4', name: 'Sala 201', area: '2º andar', status: 'ONLINE', recording: true, resolution: '1080p', tint: ['#1e2b29', '#0c1413'] },
  { id: 'c5', name: 'Copa', area: '2º andar', status: 'ONLINE', recording: false, resolution: '720p', tint: ['#26223a', '#120f1f'] },
  { id: 'c6', name: 'Corredor B', area: '2º andar', status: 'OFFLINE', recording: false, resolution: '720p', tint: ['#2a2433', '#141019'] },
  { id: 'c7', name: 'Sala 301', area: '3º andar', status: 'ONLINE', recording: false, resolution: '1080p', tint: ['#203a3a', '#0c1a1a'] },
  { id: 'c8', name: 'Depósito', area: '3º andar', status: 'NOSIGNAL', recording: false, resolution: '—', tint: ['#0d0f14', '#0d0f14'] },
  { id: 'c9', name: 'Almoxarifado', area: '3º andar', status: 'ONLINE', recording: true, resolution: '1080p', tint: ['#243044', '#101826'] },
  { id: 'c10', name: 'Estacionamento', area: '4º andar', status: 'ONLINE', recording: true, resolution: '1080p', tint: ['#243044', '#101826'] },
  { id: 'c11', name: 'Pátio Externo', area: '4º andar', status: 'ONLINE', recording: false, resolution: '1080p', tint: ['#1e2b29', '#0c1413'] },
  { id: 'c12', name: 'Terraço', area: '4º andar', status: 'ONLINE', recording: false, resolution: '1080p', tint: ['#27313f', '#101722'] },
];

/** Grupos-semente (caso prédio: 4 andares × 3 câmeras). Editáveis pelo usuário. */
export const mockGroups: CameraGroup[] = [
  { id: 'g1', name: '1º andar', cameraIds: ['c1', 'c2', 'c3'] },
  { id: 'g2', name: '2º andar', cameraIds: ['c4', 'c5', 'c6'] },
  { id: 'g3', name: '3º andar', cameraIds: ['c7', 'c8', 'c9'] },
  { id: 'g4', name: '4º andar', cameraIds: ['c10', 'c11', 'c12'] },
];

/** Favoritas-semente (ids de câmera). Exibidas em destaque na Central. */
export const mockFavorites: string[] = ['c1', 'c2', 'c4', 'c10'];

export const mockAlarms: AlarmEvent[] = [
  { id: 'a1', type: 'Linha cruzada', cameraName: 'Entrada Principal', location: 'Recepção', ago: 'há 2 min', severity: 'high' },
  { id: 'a2', type: 'Movimento detectado', cameraName: 'Estacionamento', location: 'Externa', ago: 'há 14 min', severity: 'medium' },
  { id: 'a3', type: 'Pessoa identificada', cameraName: 'Corredor B', location: 'Interna', ago: 'há 1 h', severity: 'resolved', resolvedBy: 'Enok' },
];

export const mockRecordings: RecordingItem[] = [
  { id: 'r1', range: '14:12 – 14:48', duration: '36 min', kind: 'MOVIMENTO', size: '512 MB', tint: ['#243044', '#101826'] },
  { id: 'r2', range: '11:30 – 12:05', duration: '35 min', kind: 'CONTÍNUA', size: '498 MB', tint: ['#1f2937', '#0f172a'] },
  { id: 'r3', range: '09:02 – 09:24', duration: '22 min', kind: 'MOVIMENTO', size: '310 MB', tint: ['#2b2733', '#13111a'] },
  { id: 'r4', range: '07:40 – 08:15', duration: '35 min', kind: 'CONTÍNUA', size: '486 MB', tint: ['#1e2b29', '#0c1413'] },
];

export const stats = {
  online: mockCameras.filter((c) => c.status === 'ONLINE').length,
  offline: mockCameras.filter((c) => c.status !== 'ONLINE').length,
  recording: mockCameras.filter((c) => c.recording).length,
};
