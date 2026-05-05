const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function reset() {
  const email = 'admin@local.dev';
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);
  
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, isActive: true },
    create: {
      name: 'Administrador',
      email,
      passwordHash: hash,
      role: 'SUPER_ADMIN',
      isActive: true
    }
  });
  console.log('User admin@local.dev reset with password admin123');
  await prisma.$disconnect();
}

reset().catch(console.error);
