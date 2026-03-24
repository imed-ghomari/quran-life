'use client';

import { Check, Lock } from 'lucide-react';

export const getSimilarityComparatorCardStyle = (isLearned: boolean, isResolved: boolean) => {
    if (isResolved && !isLearned) {
        return {
            background: 'color-mix(in srgb, var(--success) 8%, color-mix(in srgb, var(--foreground-secondary) 6%, var(--background-secondary)))',
            borderColor: 'color-mix(in srgb, var(--success) 34%, color-mix(in srgb, var(--foreground-secondary) 22%, var(--border)))',
        };
    }

    if (!isLearned) {
        return {
            background: 'color-mix(in srgb, var(--foreground-secondary) 7%, var(--background-secondary))',
            borderColor: 'color-mix(in srgb, var(--foreground-secondary) 24%, var(--border))',
        };
    }

    if (isResolved) {
        return {
            background: 'color-mix(in srgb, var(--success) 10%, var(--background-secondary))',
            borderColor: 'color-mix(in srgb, var(--success) 42%, var(--border))',
        };
    }

    return {
        background: undefined,
        borderColor: undefined,
    };
};

export function SimilarityComparatorStatusBadge({
    isLearned,
    isResolved,
}: {
    isLearned: boolean;
    isResolved: boolean;
}) {
    const badges = [];

    if (isResolved) {
        badges.push(
            <span
                key="resolved"
                title="Resolved"
                className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold"
                style={{
                    borderColor: 'color-mix(in srgb, var(--success) 45%, var(--border))',
                    background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                    color: 'var(--success)',
                }}
            >
                <Check size={12} />
                Resolved
            </span>
        );
    }

    if (!isLearned) {
        badges.push(
            <span
                key="locked"
                title="Surah is not in study queue"
                className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold"
                style={{
                    borderColor: 'color-mix(in srgb, var(--foreground-secondary) 28%, var(--border))',
                    background: 'color-mix(in srgb, var(--foreground-secondary) 8%, transparent)',
                    color: 'var(--foreground-secondary)',
                }}
            >
                <Lock size={12} />
                Locked
            </span>
        );
    }

    if (badges.length === 0) return null;

    return <span className="inline-flex items-center gap-1.5">{badges}</span>;
}
