import type { AppProps } from 'next/app';
import Script from 'next/script';
import '@/app/globals.css';
import 'tldraw/tldraw.css';
import { Providers } from '@/components/Providers';
import AppShell from '@/components/AppShell';

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <Providers>
            <Script id="register-sw" strategy="afterInteractive">
                {`
                    if ('serviceWorker' in navigator) {
                        window.addEventListener('load', function() {
                            navigator.serviceWorker.register('/sw.js').catch(function() {});
                        });
                    }
                `}
            </Script>
            <AppShell>
                <Component {...pageProps} />
            </AppShell>
        </Providers>
    );
}

export default MyApp;
