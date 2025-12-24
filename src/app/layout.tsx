import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import Navigation from '@/components/Navigation';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
    title: 'Quran Daily Reader',
    description: 'Complete your learned Quran portions in manageable daily readings',
    viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'Quran Reader',
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
        <html lang="ar" dir="ltr">
            <head>
                <meta name="theme-color" content="#2563eb" media="(prefers-color-scheme: light)" />
                <meta name="theme-color" content="#3b82f6" media="(prefers-color-scheme: dark)" />
            </head>
            <body>
                <Providers>
                    <div className="app-shell">
                        <Navigation />
                        <div className="page-container">
                            {children}
                        </div>
                    </div>
                </Providers>
                <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
            </body>
        </html>
    );
}
