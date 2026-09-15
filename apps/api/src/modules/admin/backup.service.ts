import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { getEncryptor, sha256 } from '../../common/crypto';
import { config } from '../../config';
import { JobsService } from '../jobs/jobs.service';

/**
 * Encrypted logical backups (PLAN §10): pg_dump -Fc → AES-256-GCM →
 * storage/backups. Restore with `node scripts/restore-backup.mjs <file>`.
 */
@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger('Backup');

  constructor(private readonly jobs: JobsService) {}

  get dir() {
    return path.join(config().storageDir, 'backups');
  }

  onModuleInit() {
    this.jobs.register('system.backup', () => this.run());
    if (process.env.BACKUP_ENABLED === 'true') this.jobs.dailyAt('system.backup', '01:00', false);
  }

  private pgDump(): string {
    const bin = process.env.PG_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\17\\bin' : '');
    return bin ? path.join(bin, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump') : 'pg_dump';
  }

  async run(): Promise<{ file: string; size: number; sha256: string }> {
    const url = process.env.DATABASE_ADMIN_URL;
    if (!url) throw new Error('DATABASE_ADMIN_URL no configurada para respaldos');
    await fs.mkdir(this.dir, { recursive: true });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const p = spawn(this.pgDump(), ['--format=custom', '--no-owner', `--dbname=${url}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      let err = '';
      p.stdout.on('data', (d: Buffer) => chunks.push(d));
      p.stderr.on('data', (d: Buffer) => (err += d.toString()));
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}: ${err.slice(0, 300)}`))));
    });
    const dump = Buffer.concat(chunks);
    const encrypted = getEncryptor().encrypt(dump);
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const file = path.join(this.dir, `sgee-${stamp}.dump.enc`);
    await fs.writeFile(file, encrypted);
    await fs.writeFile(`${file}.sha256`, sha256(dump));
    await this.prune(14);
    this.logger.log(`backup ${path.basename(file)} (${encrypted.length} bytes)`);
    return { file: path.basename(file), size: encrypted.length, sha256: sha256(dump) };
  }

  private async prune(keep: number) {
    const files = (await this.list()).slice(keep);
    for (const f of files) {
      await fs.rm(path.join(this.dir, f.name), { force: true });
      await fs.rm(path.join(this.dir, `${f.name}.sha256`), { force: true });
    }
  }

  async list() {
    try {
      const names = (await fs.readdir(this.dir)).filter((n) => n.endsWith('.dump.enc'));
      const stats = await Promise.all(names.map(async (name) => ({ name, ...(await fs.stat(path.join(this.dir, name))) })));
      return stats.map((s) => ({ name: s.name, size: s.size, createdAt: s.mtime })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch {
      return [];
    }
  }

  /** Verifies the latest backup decrypts and matches its checksum (monthly restore test helper). */
  async verifyLatest() {
    const latest = (await this.list())[0];
    if (!latest) return { ok: false, reason: 'Sin respaldos' };
    const file = path.join(this.dir, latest.name);
    const data = await new Promise<Buffer>((resolve, reject) => {
      const parts: Buffer[] = [];
      createReadStream(file).on('data', (c) => parts.push(c as Buffer)).on('end', () => resolve(Buffer.concat(parts))).on('error', reject);
    });
    const dump = getEncryptor().decrypt(data);
    const expected = (await fs.readFile(`${file}.sha256`, 'utf8')).trim();
    return { ok: sha256(dump) === expected && dump.subarray(0, 5).toString('ascii') === 'PGDMP', file: latest.name, size: dump.length };
  }
}
