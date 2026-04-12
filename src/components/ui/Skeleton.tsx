import React from 'react';

interface SkeletonProps {
    className?: string;
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    variant?: 'text' | 'rect' | 'circle';
}

export default function Skeleton({
    className = '',
    width,
    height,
    borderRadius,
    variant = 'rect',
}: SkeletonProps) {
    const style: React.CSSProperties = {
        width: width,
        height: height,
        borderRadius: borderRadius || (variant === 'circle' ? '50%' : variant === 'text' ? '4px' : '8px'),
    };

    return (
        <div
            className={`app-skeleton ${variant} ${className}`}
            style={style}
            aria-hidden="true"
        />
    );
}
