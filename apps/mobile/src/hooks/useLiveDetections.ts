import { useEffect, useState } from 'react';
import { request } from '../services/api';
import type { LiveDetection, Session } from '../types';

const POLL_INTERVAL_MS = 600;
const HEARTBEAT_INTERVAL_MS = 7000;
const LEASE_TTL_SECONDS = 20;

/**
 * Mantém o overlay de IA do ao vivo: enquanto habilitado para uma câmera, segura um
 * lease (`/ai/live-view`) que faz o backend rodar a inferência on-demand e busca as
 * detecções mais recentes em lote. Ao desabilitar/desmontar, encerra o lease e limpa.
 */
export function useLiveDetections(
  session: Session | null,
  enabled: boolean,
  cameraId: string | null,
): LiveDetection[] {
  const [detections, setDetections] = useState<LiveDetection[]>([]);

  useEffect(() => {
    if (!session || !enabled || !cameraId) {
      setDetections([]);
      return;
    }
    const sessionId = `mobile-${cameraId}-${Date.now().toString(36)}`;
    let cancelled = false;

    const postLease = (action: 'start' | 'heartbeat' | 'stop') =>
      request(session.apiUrl, `/ai/live-view/${action}/${cameraId}`, session.token, {
        method: 'POST',
        body: JSON.stringify({ sessionId, ttlSeconds: LEASE_TTL_SECONDS, viewMode: 'selected' }),
      }).catch(() => undefined);

    const poll = async () => {
      try {
        const data = await request<{ cameras?: Record<string, { detections?: LiveDetection[] }> }>(
          session.apiUrl,
          `/ai/detections/latest-batch?cameraIds=${encodeURIComponent(cameraId)}&maxAgeMs=900&limit=10`,
          session.token,
        );
        if (!cancelled) setDetections(data.cameras?.[cameraId]?.detections ?? []);
      } catch {
        if (!cancelled) setDetections([]);
      }
    };

    void postLease('start');
    void poll();
    const pollTimer = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    const heartbeatTimer = setInterval(() => { void postLease('heartbeat'); }, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
      void postLease('stop');
      setDetections([]);
    };
  }, [session?.token, session?.apiUrl, enabled, cameraId]);

  return detections;
}
