export default function OfflinePage() {
    return (
        <main style={{ padding: '2rem', textAlign: 'center' }}>
            <h1>Offline</h1>
            <p>
                You are offline right now. The app shell is available, but some data may
                require a connection the first time.
            </p>
            <p>Reconnect once to finish setup and enable full offline use.</p>
        </main>
    );
}
