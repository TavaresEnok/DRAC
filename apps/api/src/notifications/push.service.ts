import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Canal Android (deve existir no app). */
  channelId?: string;
  /** Prioridade de entrega. Alarmes usam 'high'. */
  priority?: 'default' | 'normal' | 'high';
};

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * Envio de push via Expo Push Service (https://exp.host). Sem SDK: HTTP direto.
 * Tokens são do formato `ExponentPushToken[...]`. Retorna a lista de tokens que
 * o Expo reportou como INVÁLIDOS (DeviceNotRegistered) para o chamador removê-los.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly endpoint = 'https://exp.host/--/api/v2/push/send';
  private static readonly CHUNK = 100;

  constructor(private readonly configService: ConfigService) {}

  isExpoPushToken(token: string): boolean {
    return /^ExponentPushToken\[.+\]$/.test(token) || /^ExpoPushToken\[.+\]$/.test(token);
  }

  /** Envia a MESMA mensagem para vários tokens. Devolve os tokens inválidos. */
  async sendToTokens(tokens: string[], message: PushMessage): Promise<{ invalidTokens: string[] }> {
    const valid = Array.from(new Set(tokens.filter((t) => this.isExpoPushToken(t))));
    if (!valid.length) return { invalidTokens: [] };

    const accessToken = String(this.configService.get<string>('expoAccessToken') ?? '').trim();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const invalidTokens: string[] = [];
    for (let i = 0; i < valid.length; i += PushService.CHUNK) {
      const chunk = valid.slice(i, i + PushService.CHUNK);
      const payload = chunk.map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: 'default',
        priority: message.priority ?? 'high',
        channelId: message.channelId ?? 'alarms',
      }));
      try {
        const res = await axios.post<{ data?: ExpoTicket[] }>(this.endpoint, payload, {
          headers,
          timeout: 10_000,
        });
        const tickets = res.data?.data ?? [];
        tickets.forEach((ticket, idx) => {
          if (ticket.status === 'error') {
            const err = ticket.details?.error;
            if (err === 'DeviceNotRegistered') invalidTokens.push(chunk[idx]);
            this.logger.warn(`Expo push error token=${chunk[idx]?.slice(0, 24)}… error=${err ?? ticket.message}`);
          }
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Falha ao enviar push (chunk ${i / PushService.CHUNK}): ${msg}`);
        // Não marca tokens como inválidos em falha de rede: o job pode reprocessar.
        throw error;
      }
    }
    return { invalidTokens };
  }
}
