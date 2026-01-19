import type { Metadata } from 'next';
import Script from 'next/script';
import { Outfit } from 'next/font/google';
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

export const metadata: Metadata = {
    title: 'Quran Life',
    description: 'Complete your learned Quran portions in manageable daily readings',
    viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
    manifest: '/manifest.json',
    icons: {
        icon: '/icon.png',
        apple: '/icon.png',
    },
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#ffffff' },
        { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
    ],
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'Quran Life',
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
    return (
        <html lang="ar" dir="ltr" className={outfit.variable} suppressHydrationWarning={true}>
            <body>
                <Script id="register-sw" strategy="afterInteractive">
                    {`
                        if ('serviceWorker' in navigator) {
                            window.addEventListener('load', function() {
                                navigator.serviceWorker.register('/sw.js').catch(function() {});
                            });
                        }
                    `}
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
