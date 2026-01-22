'use server'

import { FSRSBindingItem, FSRSBindingReview, computeParameters } from '@open-spaced-repetition/binding'

interface ReviewLogInput {
    nodeId: string;
    rating: number;
    elapsed_days: number;
    review: string; // ISO date
}

export async function optimizeWeights(logs: ReviewLogInput[]) {
    // 1. Transform logs to FSRSBinding items
    // Group by nodeId
    const groups: Record<string, ReviewLogInput[]> = {};
    for (const log of logs) {
        if (!groups[log.nodeId]) groups[log.nodeId] = [];
        groups[log.nodeId].push(log);
    }

    const trainSet: FSRSBindingItem[] = [];

    for (const nodeId in groups) {
        const nodeLogs = groups[nodeId].sort((a, b) => new Date(a.review).getTime() - new Date(b.review).getTime());

        const reviews = nodeLogs.map((log, index) => {
            // First review must have deltaT = 0
            const deltaT = index === 0 ? 0 : log.elapsed_days;
            return new FSRSBindingReview(log.rating, deltaT);
        });

        trainSet.push(new FSRSBindingItem(reviews));
    }

    // 2. Compute Parameters
    try {
        // Run optimization
        const parameters = await computeParameters(trainSet, { enableShortTerm: true });
        
        // Return weights to client, client will handle saving to InstantDB
        return { success: true, weights: parameters };
    } catch (e: any) {
        console.error('Optimization failed:', e);
        return { success: false, error: e.message };
    }
}
