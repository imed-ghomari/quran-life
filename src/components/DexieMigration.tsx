
'use client';

import { useEffect } from 'react';
import { migrateToDexie } from '@/lib/migration';

export function DexieMigration() {
    useEffect(() => {
        migrateToDexie();
    }, []);

    return null;
}
