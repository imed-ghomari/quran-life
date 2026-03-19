import React from 'react';

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
    const strokeWidth = Math.max(2, Math.round(size / 10));

    return (
        <div
            suppressHydrationWarning={true}
            role="status"
            aria-live="polite"
            className={`flex items-center justify-center gap-3 ${className}`}
            style={{ color }}
        >
            <span
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
                style={{
                    width: size,
                    height: size,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    willChange: 'transform',
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden',
                }}
            >
                <span
                    style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '9999px',
                        border: `${strokeWidth}px solid color-mix(in srgb, currentColor 22%, transparent)`,
                        borderTopColor: 'currentColor',
                        borderRightColor: 'color-mix(in srgb, currentColor 78%, transparent)',
                        boxSizing: 'border-box',
                        display: 'block',
                    }}
                />
            </span>
            {text && <span className="text-sm font-medium">{text}</span>}
        </div>
    );
}
