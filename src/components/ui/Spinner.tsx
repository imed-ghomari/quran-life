import React from 'react';
import ProgressLoader from './ProgressLoader';

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
}: SpinnerProps) {
    return (
        <ProgressLoader 
            type="circular" 
            size={size} 
            text={text} 
            className={className} 
            fullPage={false}
        />
    );
}
