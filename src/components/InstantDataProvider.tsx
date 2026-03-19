'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
    useInstantListeningProgress,
    useInstantMindMaps,
    useInstantMutashabihat,
    useInstantNodes,
    useInstantReviewErrors,
    useInstantSettings,
} from '@/hooks/useInstantData';

type SharedInstantDataContextValue = {
    settingsQuery: ReturnType<typeof useInstantSettings>;
    nodesQuery: ReturnType<typeof useInstantNodes>;
    mindMapsQuery: ReturnType<typeof useInstantMindMaps>;
    mutashabihatQuery: ReturnType<typeof useInstantMutashabihat>;
    reviewErrorsQuery: ReturnType<typeof useInstantReviewErrors>;
    listeningProgressQuery: ReturnType<typeof useInstantListeningProgress>;
};

const SharedInstantDataContext = createContext<SharedInstantDataContextValue | null>(null);

const isSharedInstantDataRoute = (pathname: string | null) =>
    pathname === '/dashboard'
    || pathname === '/todo'
    || pathname === '/statistics'
    || pathname === '/settings'
    || pathname?.startsWith('/docs');

function SharedInstantDataScope({ children }: { children: React.ReactNode }) {
    const settingsQuery = useInstantSettings();
    const nodesQuery = useInstantNodes();
    const mindMapsQuery = useInstantMindMaps();
    const mutashabihatQuery = useInstantMutashabihat();
    const reviewErrorsQuery = useInstantReviewErrors();
    const listeningProgressQuery = useInstantListeningProgress();

    const value = useMemo<SharedInstantDataContextValue>(() => ({
        settingsQuery,
        nodesQuery,
        mindMapsQuery,
        mutashabihatQuery,
        reviewErrorsQuery,
        listeningProgressQuery,
    }), [
        settingsQuery,
        nodesQuery,
        mindMapsQuery,
        mutashabihatQuery,
        reviewErrorsQuery,
        listeningProgressQuery,
    ]);

    return (
        <SharedInstantDataContext.Provider value={value}>
            {children}
        </SharedInstantDataContext.Provider>
    );
}

export default function InstantDataProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    if (!isSharedInstantDataRoute(pathname)) {
        return <>{children}</>;
    }

    return <SharedInstantDataScope>{children}</SharedInstantDataScope>;
}

function useSharedInstantDataContext() {
    const context = useContext(SharedInstantDataContext);
    if (!context) {
        throw new Error('Shared Instant data hooks must be used within InstantDataProvider.');
    }
    return context;
}

export function useSharedInstantSettings() {
    return useSharedInstantDataContext().settingsQuery;
}

export function useSharedInstantNodes() {
    return useSharedInstantDataContext().nodesQuery;
}

export function useSharedInstantMindMaps() {
    return useSharedInstantDataContext().mindMapsQuery;
}

export function useSharedInstantMutashabihat() {
    return useSharedInstantDataContext().mutashabihatQuery;
}

export function useSharedInstantReviewErrors() {
    return useSharedInstantDataContext().reviewErrorsQuery;
}

export function useSharedInstantListeningProgress() {
    return useSharedInstantDataContext().listeningProgressQuery;
}
