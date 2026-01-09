'use server'

import { createClient } from '@/utils/supabase/server'
import { FSRSBindingItem, FSRSBindingReview, computeParameters } from '@open-spaced-repetition/binding'

interface ReviewLogInput {
    nodeId: string;
    rating: number;
    elapsed_days: number;
    review: string; // ISO date
}

export async function optimizeWeights(logs: ReviewLogInput[]) {
    // 1. Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        throw new Error('Unauthorized')
    }

    // 2. Transform logs to FSRSBinding items
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

    // 3. Compute Parameters
    try {
        // Run optimization
        const parameters = await computeParameters(trainSet, { enableShortTerm: true });

        // 4. Save to Supabase Profile
        // We attempt to save to 'fsrs_weights' column.
        const { error } = await supabase
            .from('profiles')
            .update({ fsrs_weights: parameters })
            .eq('id', user.id);

        if (error) {
            console.error('Failed to update weights in DB:', error);
            // We return success: false but also the weights so the user can use them locally at least?
            // Actually if DB fails, maybe we just return the weights.
            return { success: false, error: error.message, weights: parameters };
        }

        return { success: true, weights: parameters };
    } catch (e: any) {
        console.error('Optimization failed:', e);
        return { success: false, error: e.message };
    }
}
