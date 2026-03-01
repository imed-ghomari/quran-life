import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import 'tldraw/tldraw.css';
import { Providers } from '@/components/Providers';
import AppShell from '@/components/AppShell';
import ErrorBoundary from '@/components/ErrorBoundary';
import ScrollbarVisibilityController from '@/components/ScrollbarVisibilityController';
import { getSiteUrl } from '@/lib/siteUrl';

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
    metadataBase: new URL(getSiteUrl()),
    title: 'Quran Life',
    description: 'Complete your learned Quran portions in manageable daily readings',
    openGraph: {
        type: 'website',
        title: 'Quran Life',
        description: 'Complete your learned Quran portions in manageable daily readings',
        siteName: 'Quran Life',
        images: [
            {
                url: '/seo-image.png',
                width: 1424,
                height: 752,
                alt: 'Quran Life social preview',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Quran Life',
        description: 'Complete your learned Quran portions in manageable daily readings',
        images: ['/seo-image.png'],
    },
    manifest: '/manifest.json',
    icons: {
        icon: [{ url: '/logo.png', type: 'image/png' }],
        shortcut: [{ url: '/logo.png', type: 'image/png' }],
        apple: [
            { url: '/pwa-icon-mobile-152.png', sizes: '152x152', type: 'image/png' },
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
    const APP_THEME_KEY = 'theme';
    const APP_ACCENT_THEME_KEY = 'accent-theme';
    const PUBLIC_THEME_KEY = 'public-theme';
    const path = window.location.pathname;
    const isPostAuthRoute = path.startsWith('/dashboard')
      || path.startsWith('/todo')
      || path.startsWith('/settings')
      || path.startsWith('/statistics')
      || path.startsWith('/docs');
    const root = window.document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!isPostAuthRoute) {
      const storedPublicTheme = window.localStorage.getItem(PUBLIC_THEME_KEY);
      const resolvedPublicTheme = storedPublicTheme === 'dark' || storedPublicTheme === 'light'
        ? storedPublicTheme
        : (prefersDark ? 'dark' : 'light');
      root.setAttribute('data-theme', resolvedPublicTheme);
      root.setAttribute('data-accent-theme', 'default');
      return;
    }

    const stored = window.localStorage.getItem(APP_THEME_KEY);
    const resolved = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
    root.setAttribute('data-theme', resolved);
    const storedAccent = window.localStorage.getItem(APP_ACCENT_THEME_KEY);
    const allowedAccents = ['default', 'dracula', 'nord', 'catppuccin', 'solarized', 'tokyo-night'];
    const resolvedAccent = storedAccent && allowedAccents.includes(storedAccent) ? storedAccent : 'default';
    root.setAttribute('data-accent-theme', resolvedAccent);
  } catch (_) {}
})();
`;

    return (
        <html lang="ar" dir="ltr" className={outfit.variable} suppressHydrationWarning={true}>
            <body suppressHydrationWarning={true}>
                <Script id="theme-bootstrap" strategy="beforeInteractive">
                    {themeBootstrapScript}
                </Script>
                <ScrollbarVisibilityController />
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
