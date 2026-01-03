import '@/app/globals.css';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { Providers } from '@/components/Providers';

const Navigation = dynamic(() => import('@/components/Navigation'), { ssr: false });
const MobileSyncBar = dynamic(() => import('@/components/MobileSyncBar'), { ssr: false });

export default function App({ Component, pageProps }: AppProps) {
    return (
        <Providers>
            <div className="app-shell">
                <Navigation />
                <div className="page-container" style={{ paddingTop: '1rem' }}>
                    <MobileSyncBar />
                    <Component {...pageProps} />
                </div>
            </div>
        </Providers>
    );
}
