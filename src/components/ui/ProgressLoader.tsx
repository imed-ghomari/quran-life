import React from 'react';

interface ProgressLoaderProps {
    type?: 'linear' | 'circular';
    size?: number;
    text?: string;
    className?: string;
    fullPage?: boolean;
}

export default function ProgressLoader({
    type = 'circular',
    size = 24,
    text,
    className = '',
    fullPage = false,
}: ProgressLoaderProps) {
    const containerClasses = fullPage
        ? 'fixed inset-0 flex flex-col items-center justify-center bg-[var(--background)] z-[100]'
        : 'flex flex-col items-center justify-center p-6 w-full h-full min-h-[100px]';

    if (type === 'linear') {
        return (
            <div className={`${containerClasses} ${className}`}>
                <div className="w-full max-w-md space-y-4">
                    <div className="progress-bar-linear">
                        <div className="progress-bar-linear-inner" />
                    </div>
                    {text && (
                        <p className="text-sm font-medium text-[var(--foreground-secondary)] text-center animate-pulse">
                            {text}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`${containerClasses} ${className}`}>
            <div className="flex flex-col items-center gap-4">
                <div 
                    className="progress-circle-minimal" 
                    style={{ width: size, height: size }} 
                />
                {text && (
                    <p className="text-sm font-medium text-[var(--foreground-secondary)] animate-pulse">
                        {text}
                    </p>
                )}
            </div>
        </div>
    );
}
