import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as bcrypt from 'bcrypt';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CameraPermissionLevel, UserRole } from '@prisma/client';
import { AccessControlService } from '../src/access-control/access-control.service';
import { AuthService } from '../src/auth/auth.service';
import { CameraStreamController } from '../src/camera-stream/camera-stream.controller';
import { CamerasController } from '../src/cameras/cameras.controller';
import { EvidenceService } from '../src/evidence/evidence.service';
import { RecordingsController } from '../src/recordings/recordings.controller';
import { RecordingsService } from '../src/recordings/recordings.service';
import { UsersService } from '../src/users/users.service';
import { PermissionsGuard } from '../src/role-permissions/permissions.guard';
import { DEFAULT_PERMISSIONS, normalizeMatrix } from '../src/role-permissions/role-permissions.constants';
import type { AuthUser } from '../src/common/types/auth-user.type';

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];

function test(name: string, run: TestCase['run']) {
  tests.push({ name, run });
}

function config(values: Record<string, string>) {
  return { get: (key: string) => values[key] };
}

function settings(values?: { maxLoginAttempts?: number; sessionTimeoutMinutes?: number }) {
  return {
    getMaxLoginAttempts: async () => values?.maxLoginAttempts ?? 5,
    getSessionTimeoutMinutes: async () => values?.sessionTimeoutMinutes ?? 0,
    isStrongPasswordRequired: async () => false,
  };
}

function assertRoutePermission(filePath: string, routeDecorator: string, permission: string) {
  const source = readFileSync(filePath, 'utf8');
  const routeIndex = source.indexOf(routeDecorator);
  assert.notEqual(routeIndex, -1, `${filePath} deve conter ${routeDecorator}`);

  const nearbyDecorators = source.slice(Math.max(0, routeIndex - 220), routeIndex);
  assert(
    nearbyDecorators.includes(`@RequirePermission('${permission}')`),
    `${filePath} ${routeDecorator} deve exigir ${permission}`,
  );
}

const cameras = [
  { id: 'cam-1', groupId: 'group-a' },
  { id: 'cam-2', groupId: 'group-a' },
  { id: 'cam-3', groupId: 'group-b' },
];

const permissions = [
  { userId: 'operator', cameraId: 'cam-3', groupId: null, level: CameraPermissionLevel.VIEW },
  { userId: 'operator', cameraId: null, groupId: 'group-a', level: CameraPermissionLevel.CONTROL },
  { userId: 'recorder', cameraId: 'cam-1', groupId: null, level: CameraPermissionLevel.RECORD },
];

function makeAccessControlService() {
  const prisma = {
    camera: {
      findMany: async (args?: any) => {
        if (args?.where?.groupId?.in) {
          return cameras.filter((camera) => args.where.groupId.in.includes(camera.groupId)).map(({ id }) => ({ id }));
        }
        return cameras.map(({ id }) => ({ id }));
      },
      findUnique: async (args: any) => cameras.find((camera) => camera.id === args.where.id) ?? null,
    },
    cameraPermission: {
      findMany: async (args: any) => {
        const where = args.where ?? {};
        let rows = permissions.filter((permission) => permission.userId === where.userId);

        if (where.cameraId?.not === null) rows = rows.filter((permission) => permission.cameraId !== null);
        if (where.groupId?.not === null) rows = rows.filter((permission) => permission.groupId !== null);
        if (Array.isArray(where.OR)) {
          rows = rows.filter((permission) => where.OR.some((condition: any) => {
            if (condition.cameraId) return permission.cameraId === condition.cameraId;
            if (condition.groupId) return permission.groupId === condition.groupId;
            return false;
          }));
        }

        return rows.map((permission) => {
          if (args.select?.cameraId) return { cameraId: permission.cameraId };
          if (args.select?.groupId) return { groupId: permission.groupId };
          if (args.select?.level) return { level: permission.level };
          return permission;
        });
      },
    },
  };

  return new AccessControlService(prisma as any);
}

test('evidence: assina e verifica pacote valido', () => {
  const service = new EvidenceService(config({ evidenceHmacSecret: '0123456789abcdef0123456789abcdef', evidenceHmacKeyId: 'test-key' }) as any);
  const payload = { cameraId: 'cam-1', exportedAt: '2026-05-22T00:00:00.000Z', clips: [{ id: 'clip-1' }] };
  const signed = { ...payload, ...service.signPackage(payload) };

  const result = service.verifyPackage(signed);

  assert.equal(result.ok, true);
  assert.equal(result.hashValid, true);
  assert.equal(result.signatureValid, true);
});

test('evidence: rejeita hash, assinatura alterada e hex malformado sem exception', () => {
  const service = new EvidenceService(config({ evidenceHmacSecret: '0123456789abcdef0123456789abcdef' }) as any);
  const payload = { cameraId: 'cam-1', clips: [{ id: 'clip-1' }] };
  const signed = { ...payload, ...service.signPackage(payload) } as any;

  assert.equal(service.verifyPackage({ ...signed, clips: [{ id: 'clip-2' }] }).ok, false);
  assert.equal(service.verifyPackage({ ...signed, signature: { ...signed.signature, value: '0'.repeat(64) } }).signatureValid, false);
  assert.equal(service.verifyPackage({ ...signed, signature: { ...signed.signature, value: 'not-hex' } }).signatureValid, false);
});

test('access-control: admin acessa todas as cameras', async () => {
  const service = makeAccessControlService();
  const admin: AuthUser = { id: 'admin', email: 'admin@test.local', name: 'Admin', role: UserRole.ADMIN };

  assert.deepEqual(await service.getAccessibleCameraIds(admin), ['cam-1', 'cam-2', 'cam-3']);
  assert.equal(await service.canAdminCamera(admin, 'cam-1'), true);
});

test('access-control: permissoes diretas e por grupo respeitam nivel minimo', async () => {
  const service = makeAccessControlService();
  const operator: AuthUser = { id: 'operator', email: 'op@test.local', name: 'Operador', role: UserRole.OPERATOR };
  const recorder: AuthUser = { id: 'recorder', email: 'rec@test.local', name: 'Recorder', role: UserRole.OPERATOR };

  assert.deepEqual(new Set(await service.getAccessibleCameraIds(operator)), new Set(['cam-1', 'cam-2', 'cam-3']));
  assert.equal(await service.canViewCamera(operator, 'cam-2'), true);
  assert.equal(await service.canControlCamera(operator, 'cam-2'), true);
  assert.equal(await service.canRecordCamera(operator, 'cam-2'), false);
  assert.equal(await service.canRecordCamera(recorder, 'cam-1'), true);
  assert.equal(await service.canAdminCamera(recorder, 'cam-1'), false);
});

test('access-control: usuario sem permissao recebe ForbiddenException', async () => {
  const service = makeAccessControlService();
  const viewer: AuthUser = { id: 'viewer', email: 'viewer@test.local', name: 'Viewer', role: UserRole.VIEWER };

  await assert.rejects(() => service.assertCanViewCamera(viewer, 'cam-1'), ForbiddenException);
});

test('auth: login normaliza email, retorna usuario sanitizado e token assinado', async () => {
  const passwordHash = await bcrypt.hash('secret', 4);
  const signCalls: any[] = [];
  const prisma = {
    user: {
      findUnique: async (args: any) => {
        assert.equal(args.where.email, 'admin@test.local');
        return {
          id: 'user-1',
          email: 'admin@test.local',
          name: 'Admin',
          role: UserRole.ADMIN,
          isActive: true,
          passwordHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    },
  };
  const jwt = {
    signAsync: async (payload: any, options: any) => {
      signCalls.push({ payload, options });
      return 'signed-token';
    },
  };
  const service = new AuthService(prisma as any, jwt as any, config({ jwtExpiresIn: '15m' }) as any, settings() as any);

  const result = await service.login(' ADMIN@Test.Local ', 'secret');

  assert.equal(result.accessToken, 'signed-token');
  assert.equal(result.user.role, UserRole.ADMIN);
  assert.equal('passwordHash' in result.user, false);
  assert.equal(signCalls[0].payload.type, 'access');
  assert.equal(signCalls[0].options.expiresIn, '15m');
});

test('auth: senha invalida rejeita com UnauthorizedException', async () => {
  const passwordHash = await bcrypt.hash('secret', 4);
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'user-1',
        email: 'admin@test.local',
        name: 'Admin',
        role: UserRole.ADMIN,
        isActive: true,
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  };
  const service = new AuthService(prisma as any, { signAsync: async () => 'never' } as any, config({}) as any, settings() as any);

  await assert.rejects(() => service.login('admin@test.local', 'wrong'), UnauthorizedException);
});

test('recordings: listagem aplica filtro de cameras acessiveis', async () => {
  const findManyCalls: any[] = [];
  const prisma = {
    recording: {
      findMany: async (args: any) => {
        findManyCalls.push(args);
        return [{ id: 'rec-1', cameraId: 'cam-1', filePath: 'cam-1/rec-1.mp4', startedAt: new Date(), endedAt: null }];
      },
      count: async (args: any) => {
        assert.deepEqual(args.where.cameraId, { in: ['cam-1'] });
        return 1;
      },
    },
  };
  const service = new RecordingsService(prisma as any, {} as any, {} as any, {} as any);

  const result = await service.list({ limit: 10, offset: 0 } as any, ['cam-1']);

  assert.equal(result.total, 1);
  assert.deepEqual(findManyCalls[0].where.cameraId, { in: ['cam-1'] });
});

test('cameras controller: usuario comum lista somente cameras acessiveis com capacidades', async () => {
  const user: AuthUser = { id: 'operator', email: 'op@test.local', name: 'Operador', role: UserRole.OPERATOR };
  const serviceCalls: any[] = [];
  const camerasService = {
    findAll: async (ids?: string[]) => {
      serviceCalls.push(ids);
      return [{ id: 'cam-1', name: 'Sala' }];
    },
  };
  const access = {
    getAccessibleCameraIds: async () => ['cam-1'],
    canViewCamera: async (_user: AuthUser, id: string) => id === 'cam-1',
    canControlCamera: async () => true,
    canRecordCamera: async () => false,
    canAdminCamera: async () => false,
  };
  const controller = new CamerasController(camerasService as any, {} as any, access as any, {} as any, {} as any);

  const result = await controller.findAll(user);

  assert.deepEqual(serviceCalls[0], ['cam-1']);
  assert.deepEqual(result[0], {
    id: 'cam-1',
    name: 'Sala',
    canView: true,
    canControl: true,
    canRecord: false,
    canAdmin: false,
  });
});

test('cameras controller: admin lista todas as cameras sem filtro e com capacidades totais', async () => {
  const user: AuthUser = { id: 'admin', email: 'admin@test.local', name: 'Admin', role: UserRole.ADMIN };
  const serviceCalls: any[] = [];
  const camerasService = {
    findAll: async (ids?: string[]) => {
      serviceCalls.push(ids);
      return [{ id: 'cam-1', name: 'Sala' }];
    },
  };
  const controller = new CamerasController(camerasService as any, {} as any, {} as any, {} as any, {} as any);

  const result = await controller.findAll(user);

  assert.equal(serviceCalls[0], undefined);
  assert.equal(result[0].canAdmin, true);
  assert.equal(result[0].canRecord, true);
});

test('camera-stream controller: cria token somente apos validar permissao de visualizacao', async () => {
  const user: AuthUser = { id: 'operator', email: 'op@test.local', name: 'Operador', role: UserRole.OPERATOR };
  const order: string[] = [];
  const access = {
    assertCanViewCamera: async (_user: AuthUser, cameraId: string) => {
      order.push(`access:${cameraId}`);
    },
  };
  const auth = {
    createStreamToken: async (userId: string, cameraId: string) => {
      order.push(`token:${userId}:${cameraId}`);
      return { streamToken: 'stream-token', expiresAt: '2026-05-22T00:05:00.000Z' };
    },
  };
  const commercialPolicy = {
    assertFeature: async (feature: string) => {
      order.push(`policy:${feature}`);
    },
  };
  const audit = { log: async () => order.push('audit') };
  const controller = new CameraStreamController({} as any, {} as any, {} as any, auth as any, access as any, audit as any, commercialPolicy as any);

  const result = await controller.createStreamToken(user, 'cam-1', { headers: {} } as any);

  assert.deepEqual(result, { streamToken: 'stream-token', expiresAt: '2026-05-22T00:05:00.000Z' });
  assert.deepEqual(order, ['access:cam-1', 'policy:localLive', 'token:operator:cam-1', 'audit']);
});

test('recordings controller: listagem de operador usa cameras acessiveis', async () => {
  const user: AuthUser = { id: 'operator', email: 'op@test.local', name: 'Operador', role: UserRole.OPERATOR };
  const calls: any[] = [];
  const recordings = {
    list: async (query: any, ids?: string[]) => {
      calls.push({ query, ids });
      return { items: [], total: 0 };
    },
  };
  const access = { getAccessibleCameraIds: async () => ['cam-1'] };
  const controller = new RecordingsController({} as any, recordings as any, {} as any, {} as any, access as any, {} as any);

  await controller.listRecordings(user, { limit: 20 } as any);

  assert.deepEqual(calls[0], { query: { limit: 20 }, ids: ['cam-1'] });
});

test('recordings controller: play-token valida camera da gravacao e grava cookie httpOnly', async () => {
  const user: AuthUser = { id: 'operator', email: 'op@test.local', name: 'Operador', role: UserRole.OPERATOR };
  const order: string[] = [];
  const cookies: any[] = [];
  const recordings = {
    ensureRecordingExists: async (id: string) => {
      order.push(`recording:${id}`);
      return { id, cameraId: 'cam-1' };
    },
  };
  const access = {
    assertCanViewCamera: async (_user: AuthUser, cameraId: string) => {
      order.push(`access:${cameraId}`);
    },
  };
  const auth = {
    createPlaybackToken: async (userId: string, recordingId: string) => {
      order.push(`token:${userId}:${recordingId}`);
      return { playToken: 'play-token', expiresAt: new Date(Date.now() + 120_000).toISOString() };
    },
  };
  const audit = { log: async () => order.push('audit') };
  const res = { cookie: (...args: any[]) => cookies.push(args) };
  const controller = new RecordingsController({} as any, recordings as any, {} as any, auth as any, access as any, audit as any);

  const result = await controller.createPlayToken(user, 'rec-1', { headers: {} } as any, res as any);

  assert.deepEqual(result.playToken, 'play-token');
  assert.deepEqual(order, ['recording:rec-1', 'access:cam-1', 'token:operator:rec-1', 'audit']);
  assert.equal(cookies[0][0], 'vms_play_token');
  assert.equal(cookies[0][1], 'play-token');
  assert.equal(cookies[0][2].httpOnly, true);
  assert.equal(cookies[0][2].sameSite, 'lax');
});

test('recordings controller: playback publico rejeita token de outra gravacao', async () => {
  const auth = {
    verifyPlaybackToken: async () => ({ sub: 'operator', recordingId: 'rec-other', type: 'play' }),
  };
  const controller = new RecordingsController({} as any, {} as any, {} as any, auth as any, {} as any, {} as any);

  await assert.rejects(
    () => controller.playRecording('rec-1', 'token', undefined, undefined, { headers: {} } as any, {} as any),
    UnauthorizedException,
  );
});

test('recordings controller: download valida permissao e audita antes de enviar arquivo', async () => {
  const user: AuthUser = { id: 'operator', email: 'op@test.local', name: 'Operador', role: UserRole.OPERATOR };
  const order: string[] = [];
  const recordings = {
    ensureRecordingExists: async (id: string) => {
      order.push(`recording:${id}`);
      return { id, cameraId: 'cam-1' };
    },
    downloadRecording: async (id: string) => {
      order.push(`download:${id}`);
      return 'streamed';
    },
  };
  const access = {
    assertCanViewCamera: async (_user: AuthUser, cameraId: string) => {
      order.push(`access:${cameraId}`);
    },
  };
  const audit = { log: async () => order.push('audit') };
  const controller = new RecordingsController({} as any, recordings as any, {} as any, {} as any, access as any, audit as any);

  const result = await controller.downloadRecording(user, 'rec-1', { headers: {} } as any, {} as any);

  assert.equal(result, 'streamed');
  assert.deepEqual(order, ['recording:rec-1', 'access:cam-1', 'audit', 'download:rec-1']);
});

test('permissions: defaults incluem PTZ para operador e bloqueiam viewer', () => {
  assert.equal(DEFAULT_PERMISSIONS.OPERATOR.ptzControl, true);
  assert.equal(DEFAULT_PERMISSIONS.VIEWER.ptzControl, false);
});

test('permissions: matriz persistida antiga herda novas chaves pelo default do papel', () => {
  const storedBeforePtzKey = { liveView: true, playback: true };

  assert.equal(normalizeMatrix(storedBeforePtzKey, DEFAULT_PERMISSIONS.OPERATOR).ptzControl, true);
  assert.equal(normalizeMatrix({ ...storedBeforePtzKey, ptzControl: false }, DEFAULT_PERMISSIONS.OPERATOR).ptzControl, false);
});

test('permissions guard: bloqueia rota com permissao fina ausente', async () => {
  const user: AuthUser = { id: 'viewer', email: 'viewer@test.local', name: 'Viewer', role: UserRole.VIEWER };
  const reflector = { getAllAndOverride: () => 'ptzControl' };
  const rolePermissions = { hasPermission: async () => false };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
  const guard = new PermissionsGuard(reflector as any, rolePermissions as any);

  await assert.rejects(() => guard.canActivate(context as any), ForbiddenException);
});

test('permissions guard: super admin ignora bloqueio da matriz fina', async () => {
  const user: AuthUser = { id: 'root', email: 'root@test.local', name: 'Root', role: UserRole.SUPER_ADMIN };
  const reflector = { getAllAndOverride: () => 'serverConfig' };
  const rolePermissions = { hasPermission: async () => false };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
  const guard = new PermissionsGuard(reflector as any, rolePermissions as any);

  assert.equal(await guard.canActivate(context as any), true);
});

test('group tenancy: admin de grupo lista somente usuarios dos grupos administrados', async () => {
  const actor: AuthUser = { id: 'manager', email: 'manager@test.local', name: 'Manager', role: UserRole.OPERATOR };
  const prisma = {
    user: {
      findMany: async (args: any) => {
        assert.deepEqual(args.where.cameraPermissions.some.groupId.in, ['group-car']);
        return [{
          id: 'client-user',
          name: 'Cliente',
          email: 'cliente@test.local',
          role: UserRole.VIEWER,
          isActive: true,
          passwordHash: 'hidden',
          createdAt: new Date(),
          updatedAt: new Date(),
        }];
      },
    },
  };
  const access = { getAdminGroupIds: async () => ['group-car'] };
  const service = new UsersService(prisma as any, { canAssignRole: () => false } as any, settings() as any, access as any);

  const result = await service.list(actor);

  assert.equal(result.length, 1);
  assert.equal('passwordHash' in result[0], false);
});

test('group tenancy: admin de grupo cria usuario ja vinculado ao proprio grupo', async () => {
  const actor: AuthUser = { id: 'manager', email: 'manager@test.local', name: 'Manager', role: UserRole.OPERATOR };
  let createArgs: any = null;
  const prisma = {
    user: {
      create: async (args: any) => {
        createArgs = args;
        return {
          id: 'new-user',
          name: args.data.name,
          email: args.data.email,
          role: args.data.role,
          isActive: true,
          passwordHash: args.data.passwordHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    },
  };
  const access = { getAdminGroupIds: async () => ['group-car'] };
  const service = new UsersService(prisma as any, { canAssignRole: () => false } as any, settings() as any, access as any);

  const result = await service.create(actor, {
    name: 'Operador Loja',
    email: ' operador@loja.test ',
    password: 'SenhaForte#123',
    role: UserRole.VIEWER,
    groupIds: ['group-car'],
    permissionLevel: CameraPermissionLevel.CONTROL,
  });

  assert.equal(result.email, 'operador@loja.test');
  assert.deepEqual(createArgs.data.cameraPermissions.create, [{ groupId: 'group-car', level: CameraPermissionLevel.CONTROL }]);
});

test('group tenancy: admin de grupo nao vincula usuario fora do proprio grupo', async () => {
  const actor: AuthUser = { id: 'manager', email: 'manager@test.local', name: 'Manager', role: UserRole.OPERATOR };
  const access = { getAdminGroupIds: async () => ['group-car'] };
  const service = new UsersService({} as any, { canAssignRole: () => false } as any, settings() as any, access as any);

  await assert.rejects(
    () => service.create(actor, {
      name: 'Intruso',
      email: 'intruso@loja.test',
      password: 'SenhaForte#123',
      role: UserRole.VIEWER,
      groupIds: ['group-other'],
    }),
    ForbiddenException,
  );
});

test('permissions audit: rotas sensiveis mantem RequirePermission', () => {
  assertRoutePermission('src/settings/settings.controller.ts', "@Patch()", 'serverConfig');
  assertRoutePermission('src/role-permissions/role-permissions.controller.ts', "@Patch(':role')", 'roleManage');
  assertRoutePermission('src/camera-stream/camera-stream.controller.ts', "@Post(':cameraId/token')", 'liveView');
  assertRoutePermission('src/ptz/ptz.controller.ts', "@Post(':cameraId/move')", 'ptzControl');
  assertRoutePermission('src/recordings/recordings.controller.ts', "@Post('recordings/:id/play-token')", 'playback');
  assertRoutePermission('src/recordings/recordings.controller.ts', "@Post('recordings/:id/compatible/prepare')", 'playback');
  assertRoutePermission('src/recordings/recordings.controller.ts', "@Post('recordings/:id/clips/export')", 'exportEvidence');
  assertRoutePermission('src/evidence/evidence.controller.ts', "@Post('sign')", 'exportEvidence');
  assertRoutePermission('src/alarms/alarms.controller.ts', "@Post('rules/:id/mute')", 'alarmAck');
});

async function main() {
  let failures = 0;
  for (const item of tests) {
    try {
      await item.run();
      console.log(`ok - ${item.name}`);
    } catch (error) {
      failures += 1;
      console.error(`not ok - ${item.name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    console.error(`${failures} teste(s) falharam.`);
    process.exit(1);
  }

  console.log(`${tests.length} teste(s) passaram.`);
}

void main();
