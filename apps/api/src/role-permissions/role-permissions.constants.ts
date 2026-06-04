import { UserRole } from '@prisma/client';

// Chaves de permissão (espelham a tela "Perfis e Permissões" do frontend).
export const PERMISSION_KEYS = [
  'liveView',
  'playback',
  'ptzControl',
  'alarmAck',
  'cameraConfig',
  'userManage',
  'auditLogs',
  'exportEvidence',
  'serverConfig',
  'roleManage',
  'reportGenerate',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionMatrix = Record<PermissionKey, boolean>;

const allTrue = (): PermissionMatrix =>
  PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {} as PermissionMatrix);

const fromList = (granted: PermissionKey[]): PermissionMatrix =>
  PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: granted.includes(key) }), {} as PermissionMatrix);

// Defaults que reproduzem o comportamento atual por papel.
export const DEFAULT_PERMISSIONS: Record<UserRole, PermissionMatrix> = {
  SUPER_ADMIN: allTrue(),
  ADMIN: allTrue(),
  OPERATOR: fromList(['liveView', 'playback', 'ptzControl', 'alarmAck', 'exportEvidence', 'reportGenerate']),
  VIEWER: fromList(['liveView', 'playback']),
};

export function normalizeMatrix(input: unknown, fallback?: Partial<PermissionMatrix>): PermissionMatrix {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return PERMISSION_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: source[key] === true || (source[key] === undefined && fallback?.[key] === true) }),
    {} as PermissionMatrix,
  );
}
