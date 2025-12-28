import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import 'tldraw/tldraw.css';
import Navigation from '@/components/Navigation';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
    title: 'Quran Life',
    description: 'Complete your learned Quran portions in manageable daily readings',
    viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
    manifest: '/manifest.json',
    icons: {
        icon: '/icon.svg',
        apple: '/icon.svg',
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
        <html lang="ar" dir="ltr">
            <body>
                <Script id="unregister-sw" strategy="beforeInteractive">
                    {`
                        if ('serviceWorker' in navigator) {
                            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                                for(let registration of registrations) {
                                    registration.unregister();
                                }
                            });
                        }
                    `}
                </Script>
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
