import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

type SettingType = 'string' | 'number' | 'boolean';

type SettingSpec = {
  type: SettingType;
  default: string | number | boolean;
  min?: number;
  max?: number;
};

// Apenas configurações que produzem efeito real no sistema são expostas aqui.
// Cada chave abaixo é lida por algum subsistema (ver SettingsService.* getters).
const SETTING_SPECS: Record<string, SettingSpec> = {
  facilityName: { type: 'string', default: 'DRAC VMS' },
  defaultRetentionDays: { type: 'number', default: 7, min: 1, max: 365 },
  autoCleanupEnabled: { type: 'boolean', default: true },
  sessionTimeoutMinutes: { type: 'number', default: 480, min: 5, max: 1440 },
  maxLoginAttempts: { type: 'number', default: 5, min: 3, max: 20 },
  requireStrongPassword: { type: 'boolean', default: true },
  alarmAudioEnabled: { type: 'boolean', default: true },
};

export type SettingsMap = Record<string, string | number | boolean>;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache: SettingsMap | null = null;
  private cacheAt = 0;
  private static readonly CACHE_TTL_MS = 15_000;

  constructor(private readonly prisma: PrismaService) {}

  private coerce(spec: SettingSpec, raw: string): string | number | boolean {
    if (spec.type === 'number') {
      const n = Number(raw);
      return Number.isFinite(n) ? n : Number(spec.default);
    }
    if (spec.type === 'boolean') return raw === 'true' || raw === '1';
    return raw;
  }

  private async loadAll(): Promise<SettingsMap> {
    if (this.cache && Date.now() - this.cacheAt < SettingsService.CACHE_TTL_MS) {
      return this.cache;
    }
    const rows = await this.prisma.systemSetting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r.value] as const));
    const merged: SettingsMap = {};
    for (const [key, spec] of Object.entries(SETTING_SPECS)) {
      const stored = byKey.get(key);
      merged[key] = stored != null ? this.coerce(spec, stored) : spec.default;
    }
    this.cache = merged;
    this.cacheAt = Date.now();
    return merged;
  }

  async getAll(): Promise<SettingsMap> {
    return { ...(await this.loadAll()) };
  }

  async patch(values: Record<string, unknown>, userId?: string): Promise<SettingsMap> {
    const entries = Object.entries(values).filter(([key]) => key in SETTING_SPECS);
    if (entries.length === 0) {
      throw new BadRequestException('Nenhuma configuração válida informada.');
    }

    for (const [key, value] of entries) {
      const spec = SETTING_SPECS[key];
      let serialized: string;
      if (spec.type === 'number') {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new BadRequestException(`Valor inválido para ${key}.`);
        const clamped = Math.min(spec.max ?? n, Math.max(spec.min ?? n, Math.round(n)));
        serialized = String(clamped);
      } else if (spec.type === 'boolean') {
        serialized = value === true || value === 'true' || value === 1 || value === '1' ? 'true' : 'false';
      } else {
        const s = String(value ?? '').trim().slice(0, 200);
        if (!s) throw new BadRequestException(`Valor inválido para ${key}.`);
        serialized = s;
      }
      await this.prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: serialized, updatedByUserId: userId ?? null },
        update: { value: serialized, updatedByUserId: userId ?? null },
      });
    }

    this.cache = null;
    this.logger.log(`Configurações atualizadas (${entries.map(([k]) => k).join(', ')}).`);
    return this.getAll();
  }

  // ── Acessores tipados usados pelos subsistemas ────────────────────────────
  async getSessionTimeoutMinutes(): Promise<number> {
    return Number((await this.loadAll()).sessionTimeoutMinutes);
  }

  async getDefaultRetentionDays(): Promise<number> {
    return Number((await this.loadAll()).defaultRetentionDays);
  }

  async isAutoCleanupEnabled(): Promise<boolean> {
    return Boolean((await this.loadAll()).autoCleanupEnabled);
  }

  async getMaxLoginAttempts(): Promise<number> {
    return Number((await this.loadAll()).maxLoginAttempts);
  }

  async isStrongPasswordRequired(): Promise<boolean> {
    return Boolean((await this.loadAll()).requireStrongPassword);
  }
}
