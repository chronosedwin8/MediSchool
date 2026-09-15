import os from 'node:os';
import path from 'node:path';

// Tests always run against the isolated test database.
if (!process.env.TEST_DATABASE_URL || !process.env.TEST_DATABASE_ADMIN_URL) throw new Error('TEST_DATABASE_URL / TEST_DATABASE_ADMIN_URL are required');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
process.env.NODE_ENV = 'test';
process.env.JOBS_ENABLED = 'false';
process.env.DEV_EXPOSE_OTP = 'true';
process.env.PHIDIAS_MOCK = 'true';
process.env.AUTH_RATE_LIMIT = '100000';
process.env.API_RATE_LIMIT = '100000';
process.env.TZ = 'America/Bogota';
process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), 'sgee-test-storage');
process.env.PUBLIC_WEB_URL = 'http://localhost:3100';
for (const k of ['S3_PHOTOS_BUCKET', 'SMTP_HOST', 'WHATSAPP_TOKEN', 'TWILIO_ACCOUNT_SID', 'VAPID_PUBLIC_KEY', 'CLAMAV_HOST']) delete process.env[k];
