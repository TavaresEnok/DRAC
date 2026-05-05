import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const secret = process.env.CAMERA_SECRET_KEY ?? 'change_me_32_chars_minimum';
    // Em produção, isso deve evoluir para KMS/secret manager, nunca uma chave fixa no processo.
    this.key = createHash('sha256').update(secret).digest();
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
    } catch (e) {
      // Tenta com a chave padrão antiga caso a chave customizada tenha sido configurada recentemente
      const fallbackKey = createHash('sha256').update('change_me_32_chars_minimum').digest();
      try {
        return this._decryptWithKey(payload, fallbackKey);
      } catch (e2) {
        throw e; // Lança o erro original se o fallback também falhar
      }
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
