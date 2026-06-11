import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import './globals.css';
import 'tldraw/tldraw.css';
import { Providers } from '@/components/Providers';
import AppShell from '@/components/AppShell';
import ErrorBoundary from '@/components/ErrorBoundary';
import InstantDataProvider from '@/components/InstantDataProvider';
import ScrollbarVisibilityController from '@/components/ScrollbarVisibilityController';
import { getSiteUrl } from '@/lib/siteUrl';

const outfit = localFont({
    src: '../assets/fonts/Outfit-VariableFont_wght.ttf',
    variable: '--font-outfit',
    weight: '100 900',
    display: 'swap',
});

const notoNaskhArabic = localFont({
    src: '../assets/fonts/NotoNaskhArabic-VariableFont_wght.ttf',
    variable: '--font-arabic-local',
    weight: '400 700',
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
    verification: {
        google: process.env.GOOGLE_SITE_VERIFICATION ?? process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
    openGraph: {
        type: 'website',
        title: 'Quran Life',
        description: 'Complete your learned Quran portions in manageable daily readings',
        siteName: 'Quran Life',
        images: [
            {
                url: '/og-image.jpg',
                width: 1200,
                height: 630,
                alt: 'Quran Life social preview',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Quran Life',
        description: 'Complete your learned Quran portions in manageable daily readings',
        images: ['/og-image.jpg'],
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
        <html lang="ar" dir="ltr" className={`${outfit.variable} ${notoNaskhArabic.variable}`} suppressHydrationWarning={true}>
            <body suppressHydrationWarning={true}>
                <Script id="theme-bootstrap" strategy="beforeInteractive">
                    {themeBootstrapScript}
                </Script>
                <Script
                    src="https://cdn.affonso.io/js/pixel.min.js"
                    data-affonso="cmovvwyu7000635gjipiwbu6r"
                    data-cookie_duration="30"
                    strategy="afterInteractive"
                />
                <ScrollbarVisibilityController />
                <Providers>
                    <ErrorBoundary>
                        <InstantDataProvider>
                            <AppShell>
                                {children}
                            </AppShell>
                        </InstantDataProvider>
                    </ErrorBoundary>
                </Providers>
            </body>
        </html>
    );
}
