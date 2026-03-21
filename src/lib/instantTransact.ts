import { db } from '@/lib/instant';

const waitMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const isInstantTransactionTimeoutError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.toLowerCase().includes('transaction timed out');
};

export const transactWithRetry = async (tx: any, maxAttempts: number = 3) => {
    let attempt = 0;
    while (attempt < maxAttempts) {
        try {
            return await db.transact(tx);
        } catch (error) {
            attempt += 1;
            if (!isInstantTransactionTimeoutError(error) || attempt >= maxAttempts) {
                throw error;
            }
            await waitMs(100 * attempt);
        }
    }
    throw new Error('Instant transact retry exhausted');
};
