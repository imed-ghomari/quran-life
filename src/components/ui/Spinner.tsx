import React from 'react';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
    size?: number;
    className?: string;
    text?: string;
}

export default function Spinner({ size = 24, className = '', text }: SpinnerProps) {
    return (
        <div className={`flex items-center justify-center gap-3 ${className}`} style={{ color: 'var(--foreground-secondary)' }}>
            <Loader2 className="animate-spin" size={size} />
            {text && <span className="text-sm font-medium">{text}</span>}
        </div>
    );
}
