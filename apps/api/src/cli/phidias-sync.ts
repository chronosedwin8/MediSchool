/**
 * CLI: node dist/cli/phidias-sync.js [--tenant colegio-aleman] [students] [photos] [history]
 */
import 'reflect-metadata';
process.env.JOBS_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma.service';
import { PhidiasSyncService } from '../modules/phidias/phidias-sync.service';

async function main() {
  const args = process.argv.slice(2);
  const tIdx = args.indexOf('--tenant');
  const slug = tIdx >= 0 ? args[tIdx + 1] : 'colegio-aleman';
  const tasks = args.filter((a, i) => !a.startsWith('--') && (tIdx < 0 || i !== tIdx + 1));
  const run = (t: string) => !tasks.length || tasks.includes(t);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const prisma = app.get(PrismaService);
    const sync = app.get(PhidiasSyncService);
    const tenant = await prisma.system((tx) => tx.tenant.findUnique({ where: { slug } }));
    if (!tenant) throw new Error(`Tenant ${slug} no existe (ejecute el seed primero)`);
    if (run('students')) console.log('students', await sync.syncStudents(tenant.id, 'FULL'));
    if (run('photos')) console.log('photos', await sync.syncPhotos(tenant.id));
    if (run('history')) console.log('history', await sync.importHistory(tenant.id));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
