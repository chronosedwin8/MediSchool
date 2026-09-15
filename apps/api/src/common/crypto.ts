import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(secret, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, n, r, p, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(secret, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomDigits(length = 6): string {
  let s = '';
  for (let i = 0; i < length; i++) s += randomInt(0, 10).toString();
  return s;
}

export function randomCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < length; i++) s += alphabet[randomInt(0, alphabet.length)];
  return s;
}

/** AES-256-GCM. Layout: iv(12) | tag(16) | ciphertext. */
export class Encryptor {
  private readonly key: Buffer;

  constructor(keyB64 = config().DATA_ENCRYPTION_KEY) {
    this.key = Buffer.from(keyB64, 'base64');
    if (this.key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (base64)');
  }

  encrypt(data: Buffer | string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]);
  }

  decrypt(payload: Buffer): Buffer {
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
  }

  encryptString(s: string): string {
    return this.encrypt(s).toString('base64');
  }

  decryptString(s: string): string {
    return this.decrypt(Buffer.from(s, 'base64')).toString('utf8');
  }
}

let encryptor: Encryptor | null = null;
export function getEncryptor(): Encryptor {
  if (!encryptor) encryptor = new Encryptor();
  return encryptor;
}

/** Canonical JSON (sorted keys) for content hashes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}
