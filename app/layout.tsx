import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.scss';

export const metadata: Metadata = {
  title: 'Professional Web Template',
  description: 'A production-ready starting point for client projects.',
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
