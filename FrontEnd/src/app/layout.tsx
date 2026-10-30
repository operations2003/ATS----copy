import React from 'react';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '../context/AuthContext';
import { SubscriptionGuard } from '../components/SubscriptionGuard';
import '../styles/tailwind.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'HireIQ - Recruitment Intelligence',
  description: 'Streamline your recruitment process with HireIQ by TaskNera. Recruitment Intelligence for smarter, faster hiring decisions.',
  icons: {
    icon: [
      { url: '/tasknera-logo-symbol.png', type: 'image/png' },
      { url: '/tasknera-icon-transparent.png', type: 'image/png' },
      { url: '/favicon.ico', type: 'image/x-icon' },
    ],
    shortcut: '/tasknera-logo-symbol.png',
    apple: '/tasknera-logo-symbol.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <AuthProvider>
          <SubscriptionGuard>{children}</SubscriptionGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
