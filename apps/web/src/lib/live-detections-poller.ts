/**
 * Poller compartilhado de detecções de IA para a página Live.
 *
 * Em vez de cada tile fazer seu próprio polling (N câmeras × 2 req/s, que estoura o
 * rate-limit numa grade cheia), todos os tiles assinam aqui e um único timer busca as
 * detecções de todas as câmeras assinadas em uma requisição em lote por ciclo.
 */
import axios from 'axios';
import { getApiBaseUrl } from './api-base';
import { useAuthStore } from '../store/authStore';

export type LiveDetection = {
  id: string;
  type: string;
  label: string;
  confidence: number | null;
  similarity: number | null;
  bbox: [number, number, number, number];
  frameWidth: number | null;
  frameHeight: number | null;
  occurredAt: string;
  overlayMode?: string | null;
  trackId?: number | null;
};

type Subscriber = (detections: LiveDetection[]) => void;

const POLL_INTERVAL_MS = 500;
const MAX_AGE_MS = 700;
const PER_CAMERA_LIMIT = 10;

class LiveDetectionsPoller {
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  subscribe(cameraId: string, callback: Subscriber): () => void {
    let set = this.subscribers.get(cameraId);
    if (!set) {
      set = new Set();
      this.subscribers.set(cameraId, set);
    }
    set.add(callback);
    this.ensureTimer();

    return () => {
      const current = this.subscribers.get(cameraId);
      if (!current) return;
      current.delete(callback);
      if (current.size === 0) this.subscribers.delete(cameraId);
      if (this.subscribers.size === 0) this.stopTimer();
    };
  }

  private ensureTimer() {
    if (this.timer != null) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  private stopTimer() {
    if (this.timer == null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private emit(cameraId: string, detections: LiveDetection[]) {
    const set = this.subscribers.get(cameraId);
    if (!set) return;
    for (const callback of set) callback(detections);
  }

  private async poll() {
    if (this.inFlight) return;
    const cameraIds = [...this.subscribers.keys()];
    if (!cameraIds.length) return;

    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) return;

    this.inFlight = true;
    try {
      const response = await axios.get<{ cameras?: Record<string, { detections?: LiveDetection[] }> }>(
        `${getApiBaseUrl()}/ai/detections/latest-batch`,
        {
          params: { cameraIds: cameraIds.join(','), maxAgeMs: MAX_AGE_MS, limit: PER_CAMERA_LIMIT },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const cameras = response.data?.cameras ?? {};
      for (const cameraId of cameraIds) {
        const detections = Array.isArray(cameras[cameraId]?.detections) ? cameras[cameraId]!.detections! : [];
        this.emit(cameraId, detections);
      }
    } catch {
      // Em falha (rede/auth), limpa overlays para não exibir caixas obsoletas.
      for (const cameraId of cameraIds) this.emit(cameraId, []);
    } finally {
      this.inFlight = false;
    }
  }
}

export const liveDetectionsPoller = new LiveDetectionsPoller();
