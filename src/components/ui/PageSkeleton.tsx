import React from 'react';
import Skeleton from './Skeleton';

interface PageSkeletonProps {
    type?: 'dashboard' | 'statistics' | 'settings' | 'todo' | 'auth' | 'mindmap' | 'generic';
}

export default function PageSkeleton({ type = 'generic' }: PageSkeletonProps) {
    if (type === 'dashboard') {
        return (
            <div className="p-4 md:p-6 space-y-8 animate-pulse">
                {/* Header/Title Area */}
                <div className="flex justify-between items-center mb-6">
                    <Skeleton width={180} height={32} />
                    <Skeleton width={120} height={40} borderRadius="20px" />
                </div>

                {/* Main Content Sections */}
                <div className="grid grid-cols-1 gap-8">
                    {/* Section 1: Review */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Skeleton width={24} height={24} variant="circle" />
                            <Skeleton width={140} height={24} />
                        </div>
                        <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--background-secondary)]/30 space-y-4">
                            <div className="flex justify-between">
                                <Skeleton width="40%" height={28} />
                                <div className="flex gap-2">
                                    <Skeleton width={32} height={32} borderRadius="8px" />
                                    <Skeleton width={32} height={32} borderRadius="8px" />
                                </div>
                            </div>
                            <div className="space-y-3 pt-4">
                                <Skeleton width="100%" height={20} />
                                <Skeleton width="90%" height={20} />
                                <Skeleton width="95%" height={20} />
                            </div>
                            <div className="flex justify-center pt-8 gap-4">
                                <Skeleton width={100} height={44} borderRadius="22px" />
                                <Skeleton width={100} height={44} borderRadius="22px" />
                                <Skeleton width={100} height={44} borderRadius="22px" />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Daily Portion */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Skeleton width={24} height={24} variant="circle" />
                            <Skeleton width={160} height={24} />
                        </div>
                        <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--background-secondary)]/30 space-y-4">
                            <div className="flex justify-between items-center">
                                <Skeleton width={120} height={24} />
                                <Skeleton width={80} height={32} borderRadius="16px" />
                            </div>
                            <div className="flex flex-wrap gap-2 py-4">
                                {[1, 2, 3, 4, 5, 6].map(i => (
                                    <Skeleton key={i} width={60} height={24} borderRadius="12px" />
                                ))}
                            </div>
                            <div className="h-48 rounded-xl border border-[var(--border)]/50 bg-[var(--background)]/50 flex items-center justify-center">
                                <Skeleton width="60%" height={24} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'statistics') {
        return (
            <div className="p-4 md:p-6 space-y-8">
                <div className="flex justify-between items-center mb-6">
                    <Skeleton width={160} height={32} />
                    <div className="flex gap-2">
                        <Skeleton width={100} height={36} borderRadius="18px" />
                        <Skeleton width={100} height={36} borderRadius="18px" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--background-secondary)]/30 space-y-4">
                            <div className="flex items-center gap-2">
                                <Skeleton width={20} height={20} variant="circle" />
                                <Skeleton width={120} height={20} />
                            </div>
                            <div className="flex justify-center py-4">
                                <Skeleton width={120} height={120} variant="circle" />
                            </div>
                            <div className="space-y-2">
                                <Skeleton width="100%" height={12} />
                                <Skeleton width="100%" height={12} />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--background-secondary)]/30 space-y-6">
                    <Skeleton width={200} height={24} />
                    <div className="h-64 flex items-end justify-between gap-2 px-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
                            <Skeleton key={i} width="6%" height={`${20 + Math.random() * 60}%`} borderRadius="4px 4px 0 0" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'todo') {
        return (
            <div className="p-4 md:p-6 space-y-8">
                <div className="flex justify-between items-center mb-6">
                    <Skeleton width={140} height={32} />
                    <Skeleton width={100} height={40} borderRadius="20px" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
                    {[1, 2, 3].map(col => (
                        <div key={col} className="p-4 rounded-2xl bg-[var(--background-secondary)]/20 border border-[var(--border)] space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <Skeleton width={80} height={20} />
                                <Skeleton width={24} height={20} borderRadius="10px" />
                            </div>
                            {[1, 2, 3].map(item => (
                                <div key={item} className="p-4 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-3">
                                    <Skeleton width="90%" height={16} />
                                    <div className="flex justify-between items-center pt-2">
                                        <Skeleton width={60} height={12} />
                                        <Skeleton width={24} height={24} variant="circle" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (type === 'auth') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--background)]">
                <div className="w-full max-w-md space-y-8 p-8 rounded-2xl border border-[var(--border)] bg-[var(--background-secondary)]/30">
                    <div className="text-center space-y-4">
                        <div className="flex justify-center">
                            <Skeleton width={64} height={64} variant="circle" />
                        </div>
                        <Skeleton width={200} height={32} className="mx-auto" />
                        <Skeleton width="80%" height={16} className="mx-auto" />
                    </div>
                    
                    <div className="space-y-6 pt-4">
                        <div className="space-y-2">
                            <Skeleton width={100} height={14} />
                            <Skeleton width="100%" height={48} borderRadius="12px" />
                        </div>
                        <Skeleton width="100%" height={48} borderRadius="12px" />
                        
                        <div className="relative py-4">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-[var(--border)]"></div>
                            </div>
                            <div className="relative flex justify-center">
                                <Skeleton width={40} height={14} className="bg-[var(--background)] px-2" />
                            </div>
                        </div>
                        
                        <Skeleton width="100%" height={48} borderRadius="12px" />
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'mindmap') {
        return (
            <div className="w-full h-full min-h-[400px] flex flex-col p-6 space-y-6 bg-[var(--background-secondary)]/10 rounded-2xl border border-[var(--border)]/50">
                <div className="flex justify-between items-center">
                    <div className="space-y-2">
                        <Skeleton width={200} height={24} />
                        <Skeleton width={120} height={14} />
                    </div>
                    <div className="flex gap-2">
                        <Skeleton width={32} height={32} borderRadius="8px" />
                        <Skeleton width={32} height={32} borderRadius="8px" />
                    </div>
                </div>
                <div className="flex-1 relative border border-[var(--border)]/30 rounded-xl overflow-hidden bg-[var(--background)]/40">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative w-64 h-64">
                            <Skeleton width={120} height={120} variant="circle" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                            <Skeleton width={80} height={40} className="absolute top-0 left-1/2 -translate-x-1/2" />
                            <Skeleton width={80} height={40} className="absolute bottom-0 left-1/2 -translate-x-1/2" />
                            <Skeleton width={80} height={40} className="absolute left-0 top-1/2 -translate-y-1/2" />
                            <Skeleton width={80} height={40} className="absolute right-0 top-1/2 -translate-y-1/2" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'settings') {
        return (
            <div className="p-4 md:p-6 space-y-8 max-w-4xl mx-auto">
                <div className="mb-8">
                    <Skeleton width={180} height={36} className="mb-2" />
                    <Skeleton width={300} height={18} />
                </div>
                
                <div className="space-y-6">
                    {/* Settings Sections */}
                    {[1, 2, 3].map(section => (
                        <div key={section} className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--background-secondary)]/30 space-y-6">
                            <div className="flex items-center gap-3">
                                <Skeleton width={24} height={24} variant="circle" />
                                <Skeleton width={150} height={24} />
                            </div>
                            
                            <div className="space-y-4">
                                {[1, 2, 3].map(item => (
                                    <div key={item} className="flex justify-between items-center py-2 border-b border-[var(--border)]/30 last:border-0">
                                        <div className="space-y-1">
                                            <Skeleton width={120} height={18} />
                                            <Skeleton width={200} height={14} />
                                        </div>
                                        <Skeleton width={44} height={24} borderRadius="12px" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Generic fallback for others
    return (
        <div className="p-4 md:p-6 space-y-8">
            <div className="mb-8">
                <Skeleton width={200} height={36} className="mb-2" />
                <Skeleton width={300} height={18} />
            </div>
            
            <div className="space-y-6">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--background-secondary)]/30">
                        <div className="flex justify-between items-center">
                            <div className="space-y-2">
                                <Skeleton width={150} height={20} />
                                <Skeleton width={250} height={14} />
                            </div>
                            <Skeleton width={50} height={28} borderRadius="14px" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
