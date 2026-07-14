import { Injectable, Logger } from '@nestjs/common';
import { createSign, randomBytes } from 'node:crypto';
import axios from 'axios';

export type IntegrityVerdict = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  details?: Record<string, unknown>;
};

/**
 * Play Integrity API (anti-adulteração/anti-engenharia-reversa SEGURO — não mexe
 * no build do app). O servidor verifica um "selo" que o Google emite atestando
 * que a requisição veio de um app GENUÍNO e não modificado, num aparelho real.
 *
 * DESLIGADO por padrão (`PLAY_INTEGRITY_ENABLED=false`). Enquanto desligado (ou
 * sem service account), `verify()` retorna `{ok:true, skipped:true}` — nada é
 * bloqueado. Ativação = 3 passos: (1) habilitar Play Integrity no Google Cloud
 * do projeto ligado ao Play Console + criar service account; (2) módulo nativo
 * no app pedir o token; (3) ligar a flag + informar a SA aqui.
 */
@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name);
  private readonly nonces = new Map<string, number>(); // nonce -> expira (ms)
  private readonly enabled = String(process.env.PLAY_INTEGRITY_ENABLED ?? 'false') === 'true';
  private readonly packageName = (process.env.PLAY_INTEGRITY_PACKAGE ?? '').trim();
  private readonly saEmail = (process.env.GOOGLE_SA_EMAIL ?? '').trim();
  private readonly saKey = (process.env.GOOGLE_SA_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  private cachedToken: { token: string; exp: number } | null = null;

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Gera um nonce de uso único (TTL 5min) para o app amarrar ao pedido de selo. */
  createNonce(): string {
    const nonce = randomBytes(24).toString('base64url');
    this.nonces.set(nonce, Date.now() + 5 * 60 * 1000);
    this.sweep();
    return nonce;
  }

  private sweep() {
    const now = Date.now();
    for (const [n, exp] of this.nonces) if (exp < now) this.nonces.delete(n);
  }

  private consumeNonce(nonce: string): boolean {
    const exp = this.nonces.get(nonce);
    if (!exp || exp < Date.now()) return false;
    this.nonces.delete(nonce); // uso único
    return true;
  }

  /** Verifica o token de integridade do app. Desligado/não-configurado = passa. */
  async verify(token: string, nonce: string): Promise<IntegrityVerdict> {
    if (!this.enabled) return { ok: true, skipped: true, reason: 'disabled' };
    if (!token || !this.consumeNonce(nonce)) return { ok: false, reason: 'nonce_invalid' };
    if (!this.packageName || !this.saEmail || !this.saKey) {
      this.logger.warn('Play Integrity ligado, mas sem service account/pacote configurado — passando.');
      return { ok: true, skipped: true, reason: 'not_configured' };
    }
    try {
      const accessToken = await this.getAccessToken();
      const url = `https://playintegrity.googleapis.com/v1/${encodeURIComponent(this.packageName)}:decodeIntegrityToken`;
      const { data } = await axios.post(
        url,
        { integrity_token: token },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 8000 },
      );
      const p = (data?.tokenPayloadExternal ?? {}) as any;
      const appVerdict = p.appIntegrity?.appRecognitionVerdict;
      const deviceVerdict: string[] = p.deviceIntegrity?.deviceRecognitionVerdict ?? [];
      const requestNonce = p.requestDetails?.nonce;
      const pkg = p.appIntegrity?.packageName;
      const ok =
        requestNonce === nonce &&
        pkg === this.packageName &&
        appVerdict === 'PLAY_RECOGNIZED' &&
        Array.isArray(deviceVerdict) &&
        deviceVerdict.includes('MEETS_DEVICE_INTEGRITY');
      return { ok, reason: ok ? undefined : 'verdict_failed', details: { appVerdict, deviceVerdict } };
    } catch (error: any) {
      this.logger.warn(`Falha ao verificar Play Integrity: ${error?.message}`);
      return { ok: false, reason: 'verify_error' };
    }
  }

  /** OAuth2 service-account (JWT RS256 → access token), com cache. */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.exp > Date.now() + 60_000) return this.cachedToken.token;
    const now = Math.floor(Date.now() / 1000);
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
      iss: this.saEmail,
      scope: 'https://www.googleapis.com/auth/playintegrity',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    const jwt = `${unsigned}.${signer.sign(this.saKey, 'base64url')}`;
    const { data } = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
      { timeout: 8000 },
    );
    this.cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return this.cachedToken.token;
  }
}
