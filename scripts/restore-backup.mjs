// Restores an encrypted backup produced by the API (system.backup):
//   node scripts/restore-backup.mjs <file.dump.enc> <postgres-url> [--pg-bin "C:\Program Files\PostgreSQL\17\bin"]
import { spawn } from 'node:child_process';
import { createDecipheriv, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [file, url] = process.argv.slice(2);
const binIdx = process.argv.indexOf('--pg-bin');
const pgBin = binIdx > 0 ? process.argv[binIdx + 1] : (process.env.PG_BIN ?? '');
if (!file || !url) {
  console.error('Uso: node scripts/restore-backup.mjs <archivo.dump.enc> <postgres-url>');
  process.exit(1);
}
const keyB64 = process.env.DATA_ENCRYPTION_KEY ?? readFileSync('.env', 'utf8').match(/^DATA_ENCRYPTION_KEY=(.+)$/m)?.[1];
const key = Buffer.from(keyB64 ?? '', 'base64');
if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY inválida');

const payload = readFileSync(file);
const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
decipher.setAuthTag(payload.subarray(12, 28));
const dump = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
if (existsSync(`${file}.sha256`)) {
  const expected = readFileSync(`${file}.sha256`, 'utf8').trim();
  if (createHash('sha256').update(dump).digest('hex') !== expected) throw new Error('Checksum no coincide');
}
console.log(`Descifrado ${dump.length} bytes; restaurando…`);
const exe = pgBin ? path.join(pgBin, process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore') : 'pg_restore';
const p = spawn(exe, ['--no-owner', '--clean', '--if-exists', `--dbname=${url}`], { stdio: ['pipe', 'inherit', 'inherit'] });
p.stdin.end(dump);
p.on('close', (code) => {
  console.log(code === 0 ? 'Restauración completada' : `pg_restore terminó con código ${code}`);
  process.exit(code ?? 1);
});
