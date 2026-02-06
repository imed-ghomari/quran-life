import type { Metadata, Viewport } from 'next';
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
    icons: {
        icon: '/logo.png',
        apple: '/logo.png',
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
            <body suppressHydrationWarning={true}>
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
