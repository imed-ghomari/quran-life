'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
    useCombinedInstantData,
    useInstantListeningProgress,
    useInstantListeningStats,
    useInstantMindMaps,
    useInstantMutashabihat,
    useInstantNodes,
    useInstantReviewErrors,
    useInstantReviewLogs,
    useInstantSettings,
} from '@/hooks/useInstantData';

type SharedInstantDataContextValue = {
    settingsQuery: ReturnType<typeof useInstantSettings>;
    nodesQuery: ReturnType<typeof useInstantNodes>;
    mindMapsQuery: ReturnType<typeof useInstantMindMaps>;
    mutashabihatQuery: ReturnType<typeof useInstantMutashabihat>;
    reviewErrorsQuery: ReturnType<typeof useInstantReviewErrors>;
    listeningProgressQuery: ReturnType<typeof useInstantListeningProgress>;
    listeningStatsQuery: ReturnType<typeof useInstantListeningStats>;
    reviewLogsQuery: ReturnType<typeof useInstantReviewLogs>;
    combinedData: ReturnType<typeof useCombinedInstantData>;
};

const SharedInstantDataContext = createContext<SharedInstantDataContextValue | null>(null);

const isSharedInstantDataRoute = (pathname: string | null) =>
    pathname === '/dashboard'
    || pathname === '/todo'
    || pathname === '/statistics'
    || pathname === '/settings'
    || pathname?.startsWith('/docs');

function SharedInstantDataScope({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    
    // Determine which entities are needed based on the route
    const requirements = useMemo(() => {
        const isDocs = pathname?.startsWith('/docs');
        const isDashboard = pathname === '/dashboard';
        const isTodo = pathname === '/todo';
        const isStats = pathname === '/statistics';
        const isSettings = pathname === '/settings';
        const needsNavMetrics = isDashboard || isTodo || isStats || isSettings || isDocs;
        const needsMindmaps = needsNavMetrics || isStats;
        const needsMutashabihat = isDashboard || isTodo || isStats || isSettings;
        const needsReviewLogs = isDashboard || isStats;
        const needsListeningStats = isDashboard;

        return {
            settings: true, // Needed everywhere
            nodes: needsNavMetrics,
            mindMaps: needsMindmaps,
            mutashabihat: needsMutashabihat,
            reviewErrors: needsNavMetrics || isStats || isSettings,
            listeningProgress: needsNavMetrics,
            listeningStats: needsListeningStats,
            reviewLogs: needsReviewLogs,
        };
    }, [pathname]);

    const combinedData = useCombinedInstantData(requirements);
    const { data } = combinedData;

    const settingsQuery = useInstantSettings(data);
    const nodesQuery = useInstantNodes(data);
    const mindMapsQuery = useInstantMindMaps(data);
    const mutashabihatQuery = useInstantMutashabihat(data);
    const reviewErrorsQuery = useInstantReviewErrors(data);
    const listeningProgressQuery = useInstantListeningProgress(data);
    const listeningStatsQuery = useInstantListeningStats(data);
    const reviewLogsQuery = useInstantReviewLogs(data);

    const value = useMemo<SharedInstantDataContextValue>(() => ({
        settingsQuery,
        nodesQuery,
        mindMapsQuery,
        mutashabihatQuery,
        reviewErrorsQuery,
        listeningProgressQuery,
        listeningStatsQuery,
        reviewLogsQuery,
        combinedData,
    }), [
        settingsQuery,
        nodesQuery,
        mindMapsQuery,
        mutashabihatQuery,
        reviewErrorsQuery,
        listeningProgressQuery,
        listeningStatsQuery,
        reviewLogsQuery,
        combinedData,
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

export function useSharedInstantListeningStats() {
    return useSharedInstantDataContext().listeningStatsQuery;
}

export function useSharedInstantReviewLogs() {
    return useSharedInstantDataContext().reviewLogsQuery;
}

export function useSharedCombinedData() {
    return useSharedInstantDataContext().combinedData;
}
