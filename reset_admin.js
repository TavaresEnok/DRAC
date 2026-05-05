const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const email = 'admin@local.dev';
  const password = 'admin123';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  const user = await prisma.user.upsert({
    where: { email },
    update: { 
      passwordHash: hash,
      isActive: true,
      role: 'SUPER_ADMIN'
    },
    create: {
      name: 'Administrador',
      email,
      passwordHash: hash,
      role: 'SUPER_ADMIN',
      isActive: true
    }
  });

  console.log(`Usuário ${email} atualizado/criado com sucesso!`);
  console.log(`Senha resetada para: ${password}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
