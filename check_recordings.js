const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.recording.count();
  console.log(`Total de gravações no banco: ${count}`);
  
  if (count > 0) {
    const latest = await prisma.recording.findMany({
      orderBy: { startedAt: 'desc' },
      take: 5,
      include: { camera: { select: { name: true } } }
    });
    console.log('Últimas 5 gravações:');
    latest.forEach(r => {
      console.log(`- [${r.camera.name}] ${r.startedAt.toISOString()} -> ${r.filePath}`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
