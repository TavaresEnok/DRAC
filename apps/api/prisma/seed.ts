import { AlarmPriority, AlarmSource, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@local.dev').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  const name = process.env.ADMIN_NAME ?? 'Administrador';

  // 1. Criar/Sincronizar Super Admin padrão
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      name,
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
  });

  // 2. Criar outros usuários de exemplo
  const users = [
    { name: 'Admin Local', email: 'admin.local@local.dev', password: 'admin123', role: UserRole.ADMIN },
    { name: 'Operador Local', email: 'operador.local@local.dev', password: 'operador123', role: UserRole.OPERATOR },
    { name: 'Viewer Local', email: 'viewer.local@local.dev', password: 'viewer123', role: UserRole.VIEWER },
  ];

  for (const item of users) {
    const found = await prisma.user.findUnique({ where: { email: item.email } });
    if (!found) {
      await prisma.user.create({
        data: {
          name: item.name,
          email: item.email,
          passwordHash: await bcrypt.hash(item.password, 10),
          role: item.role,
          isActive: true,
        },
      });
    }
  }

  // 3. Criar Unidades (Sites)
  const matriz = await prisma.site.upsert({
    where: { id: 'seed-site-matriz' },
    update: { name: 'Matriz', isActive: true, location: 'Sede' },
    create: {
      id: 'seed-site-matriz',
      name: 'Matriz',
      location: 'Sede',
      description: 'Unidade principal',
      isActive: true,
    },
  });

  const galpao = await prisma.site.upsert({
    where: { id: 'seed-site-galpao' },
    update: { name: 'Galpão', isActive: true },
    create: {
      id: 'seed-site-galpao',
      name: 'Galpão',
      description: 'Unidade logística',
      isActive: true,
    },
  });

  // 4. Criar Áreas
  const areas = [
    { id: 'seed-area-portaria', siteId: matriz.id, name: 'Portaria' },
    { id: 'seed-area-estoque', siteId: galpao.id, name: 'Estoque' },
    { id: 'seed-area-adm', siteId: matriz.id, name: 'Administração' },
  ];
  for (const area of areas) {
    await prisma.area.upsert({
      where: { id: area.id },
      update: { siteId: area.siteId, name: area.name, isActive: true },
      create: { ...area, isActive: true },
    });
  }

  // 5. Criar Grupos
  const groups = [
    { id: 'seed-group-portaria', name: 'Câmeras da Portaria' },
    { id: 'seed-group-externas', name: 'Câmeras Externas' },
  ];
  for (const group of groups) {
    await prisma.cameraGroup.upsert({
      where: { id: group.id },
      update: { name: group.name, isActive: true },
      create: { ...group, isActive: true },
    });
  }

  const alarmRules = [
    {
      name: 'Falha de stream RTSP',
      source: AlarmSource.STREAM,
      eventType: 'STREAM_RTSP_START_FAILED',
      priority: AlarmPriority.P1,
      dedupWindowSeconds: 120,
    },
    {
      name: 'Falha inicial de stream',
      source: AlarmSource.STREAM,
      eventType: 'STREAM_EARLY_FAILURE',
      priority: AlarmPriority.P2,
      dedupWindowSeconds: 120,
    },
    {
      name: 'Movimento detectado',
      source: AlarmSource.MOTION,
      eventType: 'MOTION_DETECTED',
      priority: AlarmPriority.P3,
      dedupWindowSeconds: 30,
    },
    {
      name: 'Recuperação automática de saúde',
      source: AlarmSource.HEALTH,
      eventType: 'HEALTH_AUTO_RECOVERED',
      priority: AlarmPriority.P4,
      dedupWindowSeconds: 30,
      autoResolveOnRecovery: true,
    },
  ];

  for (const rule of alarmRules) {
    await prisma.alarmRule.upsert({
      where: {
        source_eventType: {
          source: rule.source,
          eventType: rule.eventType,
        },
      },
      update: rule,
      create: rule,
    });
  }
}

main()
  .catch((error) => {
    console.error('Seed failed.');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
