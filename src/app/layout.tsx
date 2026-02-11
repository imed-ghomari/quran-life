import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import 'tldraw/tldraw.css';
import { Providers } from '@/components/Providers';
import AppShell from '@/components/AppShell';
import ErrorBoundary from '@/components/ErrorBoundary';

const outfit = Outfit({ 
    subsets: ['latin'],
    variable: '--font-outfit',
    display: 'swap',
});

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#ffffff' },
        { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
    ],
};

export const metadata: Metadata = {
    title: 'Quran Life',
    description: 'Complete your learned Quran portions in manageable daily readings',
    manifest: '/manifest.json',
    icons: {
        icon: [
            { url: '/pwa-icon-mobile-192.png', sizes: '192x192', type: 'image/png' },
            { url: '/pwa-icon-desktop-512.png', sizes: '512x512', type: 'image/png' },
        ],
        apple: [
            { url: '/pwa-icon-mobile-192.png', sizes: '192x192', type: 'image/png' },
        ],
    },
    formatDetection: {
        telephone: false,
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const themeBootstrapScript = `
(() => {
  try {
    const stored = window.localStorage.getItem('theme');
    const root = window.document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = stored === 'dark' || stored === 'light'
      ? stored
      : (prefersDark ? 'dark' : 'light');
    root.setAttribute('data-theme', resolved);
  } catch (_) {}
})();
`;

    return (
        <html lang="ar" dir="ltr" className={outfit.variable} suppressHydrationWarning={true}>
            <body suppressHydrationWarning={true}>
                <Script id="theme-bootstrap" strategy="beforeInteractive">
                    {themeBootstrapScript}
                </Script>
                <Providers>
                    <ErrorBoundary>
                        <AppShell>
                            {children}
                        </AppShell>
                    </ErrorBoundary>
                </Providers>
            </body>
        </html>
    );
}
