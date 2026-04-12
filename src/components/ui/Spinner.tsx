import React from 'react';
import Skeleton from './Skeleton';

interface SpinnerProps {
    size?: number;
    className?: string;
    text?: string;
    color?: string;
}

export default function Spinner({
    size = 24,
    className = '',
    text,
    color = 'var(--foreground-secondary)',
}: SpinnerProps) {
    return (
        <div
            suppressHydrationWarning={true}
            role="status"
            aria-live="polite"
            className={`flex items-center gap-3 ${className}`}
            style={{ color }}
        >
            <Skeleton
                width={size}
                height={size}
                variant="circle"
                className="shrink-0"
            />
            {text && <Skeleton width={120} height={16} variant="text" />}
        </div>
    );
}
