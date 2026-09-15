import path from 'node:path';
import { z } from 'zod';

const bool = (def: boolean) => z.string().optional().transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));
const optional = z.string().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z.string().min(40),
  COOKIE_SECURE: bool(false),
  DEV_EXPOSE_OTP: bool(false),
  JOBS_ENABLED: bool(true),
  PHIDIAS_BASE_URL: z.string().default('https://ds-barranquilla.phidias.co/rest'),
  PHIDIAS_TOKEN: optional,
  PHIDIAS_MOCK: bool(false),
  POLL_ID_ENFERMERIA: z.coerce.number().default(114),
  POLL_ID_ENFERMERIA_COLAB: z.coerce.number().default(113),
  AWS_ACCESS_KEY_ID: optional,
  AWS_SECRET_ACCESS_KEY: optional,
  AWS_REGION: z.string().default('us-east-2'),
  S3_PHOTOS_BUCKET: optional,
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_ATTACHMENTS_BUCKET: optional,
  S3_ATTACHMENTS_PREFIX: z.string().default('sgee/'),
  CLAMAV_HOST: optional,
  CLAMAV_PORT: z.coerce.number().default(3310),
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  SMTP_FROM: z.string().default('Enfermería <enfermeria@localhost>'),
  WHATSAPP_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_FROM: optional,
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: z.string().default('mailto:enfermeria@localhost'),
  LOG_LEVEL: z.string().default('info'),
});

export type AppConfig = z.infer<typeof schema> & { storageDir: string; isProd: boolean };

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (!cached) {
    const parsed = schema.parse(process.env);
    cached = {
      ...parsed,
      storageDir: path.resolve(process.cwd(), parsed.STORAGE_LOCAL_DIR),
      isProd: parsed.NODE_ENV === 'production',
    };
  }
  return cached;
}

/** Tests change env between suites. */
export function resetConfig() {
  cached = null;
}
