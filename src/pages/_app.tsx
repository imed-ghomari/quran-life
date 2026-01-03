import type { AppProps } from 'next/app';
import '@/app/globals.css';
import 'tldraw/tldraw.css';
import { Providers } from '@/components/Providers';
import AppShell from '@/components/AppShell';

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <Providers>
            <AppShell>
                <Component {...pageProps} />
            </AppShell>
        </Providers>
    );
}

export default MyApp;
