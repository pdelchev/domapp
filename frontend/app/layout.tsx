import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from './context/LanguageContext';
import InstallBanner from './components/InstallBanner';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'DomApp — Property Management',
  description: 'Manage your property portfolio with ease',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DomApp',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body className={inter.className}>
        <LanguageProvider>
          {children}
          <InstallBanner />
        </LanguageProvider>
      </body>
    </html>
  );
}