const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

const WEAK_PASSWORDS = new Set([
  'admin',
  'admin123',
  '123456',
  '12345678',
  'password',
  'changeme',
  'change_me',
  'qwerty123',
]);

function getArgValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function requireStrongPassword(password) {
  if (!password) {
    throw new Error('Defina ADMIN_RESET_PASSWORD ou passe --password com uma senha forte.');
  }

  if (password.length < 12) {
    throw new Error('ADMIN_RESET_PASSWORD deve ter pelo menos 12 caracteres.');
  }

  if (WEAK_PASSWORDS.has(password.trim().toLowerCase())) {
    throw new Error('Senha recusada por ser fraca ou padrao.');
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  if ([hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length < 3) {
    throw new Error('Use uma senha com pelo menos 3 tipos: maiusculas, minusculas, numeros e simbolos.');
  }
}

function requireProductionConfirmation() {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const dracEnv = String(process.env.DRAC_ENV || process.env.APP_ENV || '').toLowerCase();
  const isProduction = nodeEnv === 'production' || dracEnv === 'production' || dracEnv === 'prod';
  if (isProduction && process.env.CONFIRM_ADMIN_RESET !== 'RESET_ADMIN') {
    throw new Error('Em producao, defina CONFIRM_ADMIN_RESET=RESET_ADMIN para confirmar o reset.');
  }
}

async function reset() {
  requireProductionConfirmation();

  const email = getArgValue('email') || process.env.ADMIN_RESET_EMAIL || 'admin@local.dev';
  const password = getArgValue('password') || process.env.ADMIN_RESET_PASSWORD;
  requireStrongPassword(password);

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
  console.log(`Usuario ${email} atualizado/criado com sucesso.`);
  console.log('Senha definida a partir de ADMIN_RESET_PASSWORD/--password e nao foi exibida.');
}

reset()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
