import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly legacyKeys: Buffer[];
  private static readonly insecureSecrets = new Set([
    '',
    'change_me_32_chars_minimum',
    'change_me_32_chars_minimum_vms_key',
  ]);

  constructor() {
    const secret = (process.env.CAMERA_SECRET_KEY ?? '').trim();
    if (!secret || CryptoService.insecureSecrets.has(secret) || secret.length < 32) {
      throw new Error(
        'CAMERA_SECRET_KEY inválida. Defina um segredo forte (>= 32 chars) e não use valores padrão.',
      );
    }
    this.key = createHash('sha256').update(secret).digest();
    this.legacyKeys = (process.env.CAMERA_SECRET_KEY_LEGACY ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value !== secret)
      .map((value) => createHash('sha256').update(value).digest());
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(payload: string): string {
    try {
      return this._decryptWithKey(payload, this.key);
    } catch (error) {
      for (const legacyKey of this.legacyKeys) {
        try {
          return this._decryptWithKey(payload, legacyKey);
        } catch {
          // Try the next legacy key. If none works, throw the original error below.
        }
      }
      throw error;
    }
  }

  private _decryptWithKey(payload: string, key: Buffer): string {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
