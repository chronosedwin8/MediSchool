/**
 * Creates the databases and the application role, applies migrations and
 * (for the main database) loads the seed.
 *   npm run db:setup            → sgee + sgee_test
 *   npm run db:reset            → drops and recreates both
 *   ... --no-seed / --only-test
 */
import { execSync } from 'node:child_process';
import { Client } from 'pg';

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');
const seed = !args.has('--no-seed');
const onlyTest = args.has('--only-test');

const adminUrl = required('DATABASE_ADMIN_URL');
const appPassword = required('DB_APP_PASSWORD');
const testAdminUrl = process.env.TEST_DATABASE_ADMIN_URL;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function dbName(url: string) {
  return new URL(url).pathname.replace(/^\//, '');
}

function maintenanceUrl(url: string) {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}

async function ensureDatabase(url: string) {
  const name = dbName(url);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Invalid database name ${name}`);
  const c = new Client({ connectionString: maintenanceUrl(url) });
  await c.connect();
  try {
    if (reset) {
      await c.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [name]);
      await c.query(`DROP DATABASE IF EXISTS ${name}`);
      console.log(`  ✗ dropped ${name}`);
    }
    const exists = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!exists.rowCount) {
      await c.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
      console.log(`  ✓ created ${name}`);
    }
    const role = await c.query(`SELECT 1 FROM pg_roles WHERE rolname = 'sgee_app'`);
    const pw = appPassword.replace(/'/g, "''");
    if (!role.rowCount) await c.query(`CREATE ROLE sgee_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${pw}'`);
    else await c.query(`ALTER ROLE sgee_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${pw}'`);
  } finally {
    await c.end();
  }
}

function migrate(url: string) {
  console.log(`  → migrate ${dbName(url)}`);
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_ADMIN_URL: url } });
}

async function main() {
  const targets = onlyTest ? [] : [adminUrl];
  if (testAdminUrl) targets.push(testAdminUrl);
  for (const url of targets) {
    await ensureDatabase(url);
    migrate(url);
  }
  if (seed && !onlyTest) {
    execSync('npx tsx scripts/seed.ts', { stdio: 'inherit', env: process.env });
  }
  console.log('\n✔ Base de datos lista');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
