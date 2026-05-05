import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

function extract(content: string, name: string): string | null {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*process\\.env\\.${name}\\s*\\|\\|\\s*'([^']*)'`);
  const m = content.match(re);
  return m?.[1] ?? null;
}

function extractNumber(content: string, name: string): number | null {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*Number\\(process\\.env\\.${name}\\s*\\|\\|\\s*(\\d+)\\)`);
  const m = content.match(re);
  return m ? Number(m[1]) : null;
}

function encryptPassword(plainText: string): string {
  const secret = process.env.CAMERA_SECRET_KEY ?? 'change_me_32_chars_minimum';
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

async function main() {
  const prisma = new PrismaClient();
  const legacyPath = join(process.cwd(), '..', '..', 'legacy', 'node-express-prototype', 'server.js');
  const source = readFileSync(legacyPath, 'utf8');

  const ip = extract(source, 'CAMERA_IP');
  const username = extract(source, 'CAMERA_USER');
  const password = extract(source, 'CAMERA_PASSWORD');
  const rtspPort = extractNumber(source, 'RTSP_PORT') ?? 554;
  const onvifPort = extractNumber(source, 'ONVIF_PORT') ?? 8075;
  const rtspChannel = extract(source, 'RTSP_CHANNEL') ?? '1';
  const rtspSubtype = extract(source, 'RTSP_SUBTYPE') ?? '0';
  const onvifPath = extract(source, 'ONVIF_PTZ_PATH') ?? '/onvif/ptz_service';
  const onvifProfileToken = extract(source, 'ONVIF_PROFILE_TOKEN') ?? 'Profile000';

  if (!ip || !username || !password) {
    throw new Error('Nao foi possivel extrair dados minimos da camera no legacy/server.js');
  }

  const existing = await prisma.camera.findFirst({
    where: { ip, username },
    orderBy: { createdAt: 'asc' },
  });

  const payload = {
    name: 'Legacy Camera',
    ip,
    rtspPort,
    onvifPort,
    username,
    passwordEncrypted: encryptPassword(password),
    rtspPath: null,
    onvifPath,
    onvifProfileToken,
    channel: Number(rtspChannel),
    subtype: Number(rtspSubtype),
  };

  if (existing) {
    await prisma.camera.update({ where: { id: existing.id }, data: payload });
    console.log('Legacy camera atualizada com sucesso.');
  } else {
    await prisma.camera.create({ data: payload });
    console.log('Legacy camera importada com sucesso.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Falha ao importar camera legada:', err.message);
  process.exit(1);
});
