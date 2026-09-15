import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import type { StoredFile } from '@sgee/db';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { AuthUser } from '../../common/auth';
import { getEncryptor, sha256 } from '../../common/crypto';
import { Problem } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { config } from '../../config';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Detects the real type from magic bytes — the client-provided MIME is not trusted. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

export const FILE_KINDS = ['PRESCRIPTION', 'INJURY_PHOTO', 'VACCINE_CARD', 'MEDICAL_CERTIFICATE', 'SPECIALIST_CONCEPT', 'EXCUSE', 'SIGNATURE', 'ATTACHMENT', 'EXPORT'] as const;

@Injectable()
export class StorageService {
  private readonly logger = new Logger('Storage');
  private s3: S3Client | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private client(): S3Client {
    if (!this.s3) {
      const c = config();
      this.s3 = new S3Client({
        region: c.AWS_REGION,
        credentials: c.AWS_ACCESS_KEY_ID && c.AWS_SECRET_ACCESS_KEY ? { accessKeyId: c.AWS_ACCESS_KEY_ID, secretAccessKey: c.AWS_SECRET_ACCESS_KEY } : undefined,
      });
    }
    return this.s3;
  }

  async save(
    user: Pick<AuthUser, 'id' | 'tenantId'>,
    input: { buffer: Buffer; originalName: string; kind: string; ownerPersonId?: string | null; expiresOn?: Date | null; allowAnyType?: boolean; mimeType?: string },
  ): Promise<StoredFile> {
    if (input.buffer.length > MAX_UPLOAD_BYTES) throw new Problem(413, 'FILE_TOO_LARGE', 'El archivo supera 10 MB.');
    const mime = input.allowAnyType ? (input.mimeType ?? 'application/octet-stream') : sniffMime(input.buffer);
    if (!mime) throw new Problem(415, 'FILE_TYPE_NOT_ALLOWED', 'Solo se permiten imágenes JPG, PNG, WEBP o documentos PDF.');
    const scanStatus = await this.scan(input.buffer);
    if (scanStatus === 'INFECTED') throw new Problem(422, 'FILE_INFECTED', 'El archivo fue rechazado por el antivirus.');

    const c = config();
    const id = randomUUID();
    const d = new Date();
    const key = `${user.tenantId}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${id}.bin`;
    const encrypted = getEncryptor().encrypt(input.buffer);

    if (c.STORAGE_DRIVER === 's3' && c.S3_ATTACHMENTS_BUCKET) {
      await this.client().send(
        new PutObjectCommand({
          Bucket: c.S3_ATTACHMENTS_BUCKET,
          Key: `${c.S3_ATTACHMENTS_PREFIX}${key}`,
          Body: encrypted,
          ContentType: 'application/octet-stream',
          ServerSideEncryption: 'AES256',
        }),
      );
    } else {
      const full = path.join(c.storageDir, key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, encrypted);
    }

    return this.prisma.forUser(user, (tx) =>
      tx.storedFile.create({
        data: {
          id,
          tenantId: user.tenantId,
          storageKey: key,
          originalName: input.originalName.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 150),
          mimeType: mime,
          size: input.buffer.length,
          sha256: sha256(input.buffer),
          kind: input.kind,
          driver: c.STORAGE_DRIVER === 's3' && c.S3_ATTACHMENTS_BUCKET ? 's3' : 'local',
          encrypted: true,
          scanStatus,
          ownerPersonId: input.ownerPersonId ?? null,
          expiresOn: input.expiresOn ?? null,
          uploadedBy: user.id,
        },
      }),
    );
  }

  async read(file: StoredFile): Promise<Buffer> {
    const c = config();
    let raw: Buffer;
    if (file.driver === 's3') {
      const out = await this.client().send(new GetObjectCommand({ Bucket: c.S3_ATTACHMENTS_BUCKET!, Key: `${c.S3_ATTACHMENTS_PREFIX}${file.storageKey}` }));
      raw = Buffer.from(await out.Body!.transformToByteArray());
    } else {
      raw = await fs.readFile(path.join(c.storageDir, file.storageKey));
    }
    const data = file.encrypted ? getEncryptor().decrypt(raw) : raw;
    if (sha256(data) !== file.sha256) throw new Problem(500, 'FILE_INTEGRITY', 'El archivo no supera la verificación de integridad.');
    return data;
  }

  /** ClamAV INSTREAM when CLAMAV_HOST is configured; otherwise SKIPPED. */
  private scan(buf: Buffer): Promise<'CLEAN' | 'INFECTED' | 'SKIPPED' | 'ERROR'> {
    const c = config();
    if (!c.CLAMAV_HOST) return Promise.resolve('SKIPPED');
    return new Promise((resolve) => {
      const socket = net.createConnection({ host: c.CLAMAV_HOST, port: c.CLAMAV_PORT });
      let reply = '';
      socket.setTimeout(15000, () => {
        socket.destroy();
        resolve('ERROR');
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        const size = Buffer.alloc(4);
        size.writeUInt32BE(buf.length);
        socket.write(size);
        socket.write(buf);
        socket.write(Buffer.alloc(4));
      });
      socket.on('data', (d) => (reply += d.toString()));
      socket.on('end', () => resolve(reply.includes('FOUND') ? 'INFECTED' : reply.includes('OK') ? 'CLEAN' : 'ERROR'));
      socket.on('error', () => resolve('ERROR'));
    });
  }
}

/** Student photos in S3 (`{code}.jpg|png|jpeg`), as in the first project. */
@Injectable()
export class PhotoService {
  private readonly cache = new Map<string, { url: string | null; key: string | null; expires: number }>();
  private s3: S3Client | null = null;

  private client() {
    if (!this.s3) {
      const c = config();
      this.s3 = new S3Client({
        region: c.AWS_REGION,
        credentials: c.AWS_ACCESS_KEY_ID && c.AWS_SECRET_ACCESS_KEY ? { accessKeyId: c.AWS_ACCESS_KEY_ID, secretAccessKey: c.AWS_SECRET_ACCESS_KEY } : undefined,
      });
    }
    return this.s3;
  }

  get enabled() {
    return !!config().S3_PHOTOS_BUCKET && !!config().AWS_ACCESS_KEY_ID;
  }

  /** Returns the S3 key and ETag if a photo exists for the code. */
  async find(code: string): Promise<{ key: string; etag: string } | null> {
    if (!this.enabled || !/^\d{1,10}$/.test(code)) return null;
    for (const ext of ['jpg', 'png', 'jpeg']) {
      const key = `${code}.${ext}`;
      try {
        const head = await this.client().send(new HeadObjectCommand({ Bucket: config().S3_PHOTOS_BUCKET!, Key: key }));
        return { key, etag: (head.ETag ?? '').replace(/"/g, '') };
      } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 404 && status !== 403 && (err as Error).name !== 'NotFound') throw err;
      }
    }
    return null;
  }

  /**
   * Signed URL for a photo previously linked by the Phidias photo sync. Never probes the bucket
   * by code: another school (or the demo tenant) may reuse a code that belongs to a real student.
   */
  async signedUrl(photoKey: string | null, _code?: string, force = false): Promise<string | null> {
    if (!this.enabled || !photoKey) return null;
    const cached = this.cache.get(photoKey);
    if (!force && cached && cached.expires > Date.now()) return cached.url;
    const url = await getSignedUrl(this.client(), new GetObjectCommand({ Bucket: config().S3_PHOTOS_BUCKET!, Key: photoKey }), { expiresIn: 3600 });
    this.cache.set(photoKey, { url, key: photoKey, expires: Date.now() + 55 * 60_000 });
    return url;
  }
}
