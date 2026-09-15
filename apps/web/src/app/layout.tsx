import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'MediSchool — Enfermería escolar', template: '%s · MediSchool' },
  description: 'Sistema de Gestión de Enfermería Escolar',
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
