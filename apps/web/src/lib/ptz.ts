import axios from 'axios';
import { getApiBaseUrl } from './api-base';
import { useAuthStore } from '../store/authStore';

export const PTZ_DIRECTIONS = ['Up', 'Down', 'Left', 'Right', 'ZoomIn', 'ZoomOut'] as const;
export type PTZDirection = (typeof PTZ_DIRECTIONS)[number];

type PtzAction =
  | { action: 'start'; direction: PTZDirection; speed?: number }
  | { action: 'step'; direction: PTZDirection; speed?: number; durationMs?: number }
  | { action: 'home' }
  | { action: 'stop'; direction?: PTZDirection };

type PtzResponse = {
  status: 'ok' | 'error';
  message?: string;
  cameraId?: string;
  action?: 'start' | 'stop' | 'step' | 'home';
  direction?: PTZDirection;
};

function client() {
  const accessToken = useAuthStore.getState().accessToken;
  return axios.create({
    baseURL: getApiBaseUrl(),
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
}

export async function sendPtzCommand(cameraId: string, payload: PtzAction) {
  const { data } = await client().post<PtzResponse>(`/ptz/${cameraId}/move`, payload);
  if (data.status !== 'ok') {
    throw new Error(data.message ?? 'Falha ao enviar comando PTZ.');
  }
  return data;
}
