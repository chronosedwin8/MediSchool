import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { SITE } from '@/lib/site';
import { Providers } from './providers';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: 'MediSchool — Enfermería escolar', template: '%s · MediSchool' },
  description: SITE.description,
  applicationName: SITE.name,
  category: 'health',
  formatDetection: { telephone: false },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'MediSchool', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f6761' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1112' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CO" suppressHydrationWarning>
      <body className="min-h-dvh font-sans text-[15px]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
