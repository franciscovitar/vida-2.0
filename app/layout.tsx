import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { themeInitScript } from '@/theme/theme-script';

import './globals.scss';

export const metadata: Metadata = {
  title: {
    default: 'Vida 2.0',
    template: '%s · Vida 2.0',
  },
  description:
    'Aplicación personal para centralizar hábitos, salud, productividad, proyectos y aprendizaje.',
  applicationName: 'Vida 2.0',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0e14' },
  ],
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
