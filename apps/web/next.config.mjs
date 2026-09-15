import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const ws = process.env.NEXT_PUBLIC_API_WS_URL ?? 'http://localhost:4000';
const isDev = process.env.NODE_ENV !== 'production';
const PRIVATE_SECTIONS = 'panel|login|registro|cambiar-clave|confirmar-salida|enfermeria|docente|porteria|familia|estudiantes|estudiante|mensajes|perfil|salud-publica|estadisticas|admin';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.amazonaws.com",
  "font-src 'self' data:",
  `connect-src 'self' ${ws} ${ws.replace(/^http/, 'ws')}`,
  "media-src 'self' blob:",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep the dev-tools badge away from the sidebar user card.
  devIndicators: { position: 'bottom-right' },
  outputFileTracingRoot: root,
  transpilePackages: ['@sgee/ui'],
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      // The authenticated application is never indexed (the public site is / and /ayuda).
      { source: `/:section(${PRIVATE_SECTIONS})`, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: `/:section(${PRIVATE_SECTIONS})/:rest*`, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default nextConfig;
