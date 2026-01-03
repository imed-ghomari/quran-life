import '@/app/globals.css';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';

const Navigation = dynamic(() => import('@/components/Navigation'), { ssr: false });
const MobileSyncBar = dynamic(() => import('@/components/MobileSyncBar'), { ssr: false });

export default function App({ Component, pageProps }: AppProps) {
    return (
        <div className="app-shell">
            <Navigation />
            <div className="page-container" style={{ paddingTop: '3.5rem' }}>
                <MobileSyncBar />
                <Component {...pageProps} />
            </div>
        </div>
    );
}
