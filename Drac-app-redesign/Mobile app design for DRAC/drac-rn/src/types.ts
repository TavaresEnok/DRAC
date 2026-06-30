/** Tipos de domínio do app (UI). A IA de produção pode alinhar com os tipos da API. */

export type Tab = 'central' | 'mosaico' | 'reproducao' | 'alarmes' | 'ajustes';

export type CameraStatus = 'ONLINE' | 'OFFLINE' | 'NOSIGNAL';

export interface Camera {
  id: string;
  name: string;
  /** área física / andar (ex.: "1º andar"). Usado como rótulo, não como grupo. */
  area: string;
  status: CameraStatus;
  recording: boolean;
  resolution: string;
  /** placeholder visual: par de cores para o gradiente do preview */
  tint: [string, string];
}

/**
 * Grupo de câmeras criado pelo usuário (ex.: "1º andar", "Entradas").
 * Uma câmera pode pertencer a vários grupos. Persistir por usuário.
 */
export interface CameraGroup {
  id: string;
  name: string;
  cameraIds: string[];
}

export type AlarmSeverity = 'high' | 'medium' | 'resolved';

export interface AlarmEvent {
  id: string;
  type: string;        // ex.: "Linha cruzada", "Movimento detectado"
  cameraName: string;
  location: string;
  ago: string;         // ex.: "há 2 min"
  severity: AlarmSeverity;
  resolvedBy?: string;
}

export interface RecordingItem {
  id: string;
  range: string;       // ex.: "14:12 – 14:48"
  duration: string;    // ex.: "36 min"
  kind: 'MOVIMENTO' | 'CONTÍNUA' | 'PESSOA';
  size: string;        // ex.: "512 MB"
  tint: [string, string];
}

export interface UserInfo {
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERADOR' | 'VIEWER';
  initials: string;
}
