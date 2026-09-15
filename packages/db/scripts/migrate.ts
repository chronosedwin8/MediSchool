import { execSync } from 'node:child_process';

for (const name of ['DATABASE_ADMIN_URL', 'TEST_DATABASE_ADMIN_URL']) {
  const url = process.env[name];
  if (!url) continue;
  console.log(`→ prisma migrate deploy (${new URL(url).pathname.slice(1)})`);
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_ADMIN_URL: url } });
}
