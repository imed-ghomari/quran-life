import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
    SplitSquareHorizontal, Check, PenTool, X, Trash2, Plus, Minus, ImageIcon
} from 'lucide-react';

export type AnchorBuilderState = { breaks: number[]; labels: Record<number, string> };

export function MobileAnchorBuilder({
    surahId,
    verseCount,
    builderState,
    mindmapImageUrl,
    mindmapImageUrlDark,
    isDark,
    onAddBreak,
    onRemoveBreak,
    onSave,
    hasReviewedHistory,
}: {
    surahId: number;
    verseCount: number;
    builderState: AnchorBuilderState;
    mindmapImageUrl?: string | null;
    mindmapImageUrlDark?: string | null;
    isDark?: boolean;
    onAddBreak: (val: number) => void;
    onRemoveBreak: (val: number) => void;
    onSave: () => void;
    hasReviewedHistory: boolean;
}) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [currentSplitPoint, setCurrentSplitPoint] = useState<number>(1);
    const [isEditing, setIsEditing] = useState(false);
    const [showFullMindmap, setShowFullMindmap] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const displayUrl = isDark ? (mindmapImageUrlDark || mindmapImageUrl) : (mindmapImageUrl || mindmapImageUrlDark);

    // Height of one "verse unit" in pixels
    const VERSE_HEIGHT = 50;

    // Intersection Observer to detect the centered "gap"
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const val = Number(entry.target.getAttribute('data-split-val'));
                        if (!isNaN(val)) {
                            setCurrentSplitPoint(val);
                        }
                    }
                });
            },
            {
                root: scrollContainerRef.current,
                rootMargin: '-50% 0px -50% 0px', // Creates a 1px line in the center
                threshold: 0
            }
        );

        // Observe all gap elements
        const container = scrollContainerRef.current;
        if (container) {
            const gaps = container.querySelectorAll('.anchor-gap-target');
            gaps.forEach(gap => observer.observe(gap));
        }

        return () => observer.disconnect();
    }, [verseCount, isEditing, builderState.breaks]); // Re-run when layout changes

    // Sort breaks and create segments for view mode
    const breaks = Array.from(new Set([...builderState.breaks]))
        .sort((a, b) => a - b)
        .filter(b => b > 0 && b < verseCount);

    const boundaries = Array.from(new Set([1, ...breaks.map(b => b + 1), verseCount + 1])).sort((a, b) => a - b);

    // Full Screen Mindmap Overlay
    if (showFullMindmap && displayUrl) {
        return (
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 100,
                    background: 'var(--background)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                onClick={() => setShowFullMindmap(false)}
            >
                <div style={{ position: 'absolute', top: 20, right: 20, color: 'var(--foreground)', zIndex: 101, display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.max(0.5, z - 0.25)); }}
                        style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '40px', height: '40px', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                        <Minus size={24} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.min(3, z + 0.25)); }}
                        style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '40px', height: '40px', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                        <Plus size={24} />
                    </button>
                    <button
                        onClick={() => setShowFullMindmap(false)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--foreground)', cursor: 'pointer', marginLeft: '0.5rem' }}
                    >
                        <X size={32} />
                    </button>
                </div>
                <div style={{ width: '100%', height: '100%', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {displayUrl && (
                        <Image
                            src={displayUrl}
                            alt="Full Mindmap"
                            fill
                            style={{
                                objectFit: 'contain',
                                transform: `scale(${zoomLevel})`,
                                transition: 'transform 0.2s ease-out',
                                cursor: zoomLevel > 1 ? 'grab' : 'default'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                </div>
                <span style={{ position: 'absolute', bottom: 30, color: 'var(--foreground)', background: 'var(--background-secondary)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '20px' }}>
                    Tap anywhere to close • Zoom: {Math.round(zoomLevel * 100)}%
                </span>
            </div>
        );
    }

    // View Mode: List of Segments
    if (!isEditing) {
        return (
            <div className="mobile-anchor-builder" style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                background: 'var(--background)',
                borderRadius: '16px',
                border: '1px solid var(--border)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1rem',
                    background: 'var(--background-secondary)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    {displayUrl && (
                        <div
                            style={{
                                height: '150px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                background: 'var(--background-secondary)',
                                position: 'relative',
                                cursor: 'pointer'
                            }}
                            onClick={() => setShowFullMindmap(true)}
                        >
                            <Image
                                src={displayUrl}
                                alt="Mindmap Preview"
                                fill
                                style={{ objectFit: 'contain' }}
                            />
                            <div style={{
                                position: 'absolute',
                                bottom: 8,
                                right: 8,
                                background: 'var(--background)',
                                color: 'var(--foreground)',
                                border: '1px solid var(--border)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                            }}>
                                <ImageIcon size={12} />
                                Tap to Zoom
                            </div>
                        </div>
                    )}
                    <button
                        className="btn btn-secondary btn-full"
                        onClick={() => {
                            if (hasReviewedHistory) {
                                if (!confirm("Warning: This Surah has verse chunks that have already been reviewed.\n\nModifying anchors will reset the review progress (memory nodes) for these chunks.\n\nAre you sure you want to proceed?")) {
                                    return;
                                }
                            }
                            setIsEditing(true);
                        }}
                    >
                        <PenTool size={16} style={{ marginRight: 8 }} />
                        Edit Splits
                    </button>
                </div>

                {/* Segments List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground-secondary)', marginBottom: '1rem' }}>
                        Defined Segments ({boundaries.length - 1})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {boundaries.slice(0, -1).map((start, idx) => {
                            const end = boundaries[idx + 1] - 1;
                            return (
                                <div key={start} style={{
                                    padding: '1rem',
                                    background: 'var(--background-secondary)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{
                                            background: 'var(--accent)',
                                            color: 'white',
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.75rem',
                                            fontWeight: 700
                                        }}>
                                            {idx + 1}
                                        </div>
                                        <span style={{ fontWeight: 600 }}>Verses {start} - {end}</span>
                                    </div>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)' }}>
                                        {end - start + 1} ayahs
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // Edit Mode
    return (
        <div className="mobile-anchor-builder" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'var(--background)',
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            minHeight: '600px'
        }}>
            {/* Sticky Header Actions */}
            <div style={{
                padding: '0.75rem',
                background: 'var(--background-secondary)',
                borderBottom: '1px solid var(--border)',
                zIndex: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
                <span style={{ fontWeight: 600 }}>Editing Splits</span>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                        setIsEditing(false);
                        onSave();
                    }}
                >
                    <Check size={16} style={{ marginRight: 6 }} />
                    Confirm
                </button>
            </div>

            {/* Sticky Mindmap Preview (Small) */}
            {displayUrl && (
                <div
                    style={{
                        height: '80px',
                        background: 'var(--background-secondary)',
                        position: 'relative',
                        zIndex: 30,
                        flexShrink: 0,
                        cursor: 'pointer'
                    }}
                    onClick={() => setShowFullMindmap(true)}
                >
                    <Image
                        src={displayUrl}
                        alt="Mindmap Preview"
                        fill
                        style={{ objectFit: 'contain', opacity: 0.8 }}
                    />
                    <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'var(--background)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px' }}>
                        <ImageIcon size={10} color="var(--foreground)" />
                    </div>
                </div>
            )}

            {/* Scrollable Area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {/* The Center "Bookmark" Line - Fixed in the viewport center */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: '4px',
                    marginTop: '-2px', // Center align
                    zIndex: 20,
                    pointerEvents: 'none', // Allow clicks to pass through
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    {/* Left Dashed Line */}
                    <div style={{ flex: 1, height: '2px', background: 'var(--accent)', opacity: 0.5 }}></div>

                    {/* Center Pill */}
                    <div style={{
                        padding: '6px 16px',
                        background: 'var(--accent)',
                        color: 'white',
                        borderRadius: '20px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        zIndex: 25,
                        whiteSpace: 'nowrap'
                    }}>
                        Between {currentSplitPoint} & {currentSplitPoint + 1}
                    </div>

                    {/* Right Dashed Line */}
                    <div style={{ flex: 1, height: '2px', background: 'var(--accent)', opacity: 0.5 }}></div>
                </div>

                {/* Interaction Button - Floating near the center line */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, 30px)', // Below the line
                    zIndex: 30,
                }}>
                    {breaks.includes(currentSplitPoint) ? (
                        <div style={{ padding: '8px', background: 'rgba(var(--background-rgb), 0.8)', borderRadius: '20px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>Split Active</span>
                        </div>
                    ) : (
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => onAddBreak(currentSplitPoint)}
                            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                        >
                            <SplitSquareHorizontal size={16} style={{ marginRight: 6 }} />
                            Split Here
                        </button>
                    )}
                </div>

                {/* Scrolling List */}
                <div
                    ref={scrollContainerRef}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        overflowY: 'auto',
                        scrollSnapType: 'y mandatory',
                        WebkitOverflowScrolling: 'touch'
                    }}
                >
                    <div style={{
                        position: 'relative',
                        // Large padding to allow first/last gap to reach center
                        paddingTop: '50vh',
                        paddingBottom: '50vh',
                    }}>
                        {Array.from({ length: verseCount }).map((_, i) => {
                            const vNum = i + 1;
                            const isSplit = breaks.includes(vNum); // Split is AFTER this verse

                            return (
                                <React.Fragment key={vNum}>
                                    {/* Verse Content */}
                                    <div style={{
                                        height: `${VERSE_HEIGHT}px`,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        padding: '0 1rem',
                                        position: 'relative',
                                        // Verse is NOT the snap target
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            opacity: Math.abs(currentSplitPoint - vNum) <= 1 ? 1 : 0.4,
                                            transition: 'opacity 0.2s',
                                            fontWeight: 500
                                        }}>
                                            <span>Ayah {vNum}</span>
                                            {/* Easy Remove Button for existing splits */}
                                            {isSplit && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRemoveBreak(vNum);
                                                    }}
                                                    style={{
                                                        background: 'var(--danger-bg)',
                                                        color: 'var(--danger)',
                                                        border: '1px solid var(--danger)',
                                                        borderRadius: '4px',
                                                        padding: '2px 8px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        zIndex: 50,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 4
                                                    }}
                                                >
                                                    <X size={12} />
                                                    Remove Split
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* The Snap Target (Gap) */}
                                    {vNum < verseCount && (
                                        <div
                                            className="anchor-gap-target"
                                            data-split-val={vNum}
                                            style={{
                                                height: '20px', // Visible gap space
                                                width: '100%',
                                                scrollSnapAlign: 'center',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                position: 'relative'
                                            }}
                                        >
                                            {/* Visual Guide Line (faint) */}
                                            {isSplit && (
                                                <div style={{
                                                    position: 'absolute',
                                                    left: 0, right: 0,
                                                    height: '2px',
                                                    background: 'var(--accent)',
                                                    opacity: 0.3
                                                }} />
                                            )}
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function DesktopAnchorBuilder({
    surahId,
    verseCount,
    builderState,
    onAddBreak,
    onRemoveBreak,
    onSave,
    hasReviewedHistory,
}: {
    surahId: number;
    verseCount: number;
    builderState: AnchorBuilderState;
    onAddBreak: (val: number) => void;
    onRemoveBreak: (val: number) => void;
    onSave: () => void;
    hasReviewedHistory: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [hoverVal, setHoverVal] = useState<number | null>(null);
    const barRef = useRef<HTMLDivElement>(null);

    const breaks = Array.from(new Set([...builderState.breaks]))
        .sort((a, b) => a - b)
        .filter(b => b > 0 && b < verseCount);

    const boundaries = Array.from(new Set([1, ...breaks.map(b => b + 1), verseCount + 1])).sort((a, b) => a - b);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isEditing || !barRef.current) return;
        const rect = barRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percent = Math.max(0, Math.min(1, x / width));

        const val = percent * verseCount;
        const rounded = Math.round(val);

        if (rounded > 0 && rounded < verseCount) {
            setHoverVal(rounded);
        } else {
            setHoverVal(null);
        }
    };

    const handleMouseLeave = () => {
        setHoverVal(null);
    };

    const handleClick = () => {
        if (!isEditing) return;
        if (hoverVal && !breaks.includes(hoverVal)) {
            onAddBreak(hoverVal);
        }
    };

    return (
        <div className="anchor-builder-desktop" style={{ padding: '1rem', background: 'var(--background-secondary)', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                        <SplitSquareHorizontal size={18} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>Define Anchors</span>
                </div>
                {!isEditing ? (
                    <button className="btn btn-secondary" onClick={() => {
                        if (hasReviewedHistory) {
                            if (!confirm("Warning: This Surah has verse chunks that have already been reviewed.\n\nModifying anchors will reset the review progress (memory nodes) for these chunks.\n\nAre you sure you want to proceed?")) {
                                return;
                            }
                        }
                        setIsEditing(true);
                    }}>
                        Edit Anchors
                    </button>
                ) : (
                    <button className="btn btn-primary" onClick={() => {
                        setIsEditing(false);
                        onSave();
                    }}>
                        Confirm Changes
                    </button>
                )}
            </div>

            <div
                className="anchor-bar-track"
                ref={barRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
                style={{
                    position: 'relative',
                    height: '40px',
                    background: isEditing ? 'rgba(0,0,0,0.1)' : 'var(--background)',
                    borderRadius: '8px',
                    cursor: isEditing ? 'pointer' : 'default',
                    marginTop: '1rem',
                    marginBottom: '2rem',
                    border: '1px solid var(--border)'
                }}
            >
                {boundaries.slice(0, -1).map((start, idx) => {
                    const end = boundaries[idx + 1] - 1;
                    const widthPercent = ((end - start + 1) / verseCount) * 100;
                    const leftPercent = ((start - 1) / verseCount) * 100;

                    return (
                        <div key={`seg-${start}`} style={{
                            position: 'absolute',
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                            borderRight: idx < boundaries.length - 2 ? '1px solid var(--border)' : 'none'
                        }}>
                            {!isEditing && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', background: 'var(--background-secondary)', padding: '2px 6px', borderRadius: '4px' }}>
                                    {start}-{end}
                                </span>
                            )}
                        </div>
                    );
                })}

                {breaks.map(b => (
                    <React.Fragment key={b}>
                        <div style={{
                            position: 'absolute',
                            left: `${(b / verseCount) * 100}%`,
                            height: '100%',
                            width: '2px',
                            background: 'var(--primary)',
                            transform: 'translateX(-50%)',
                            pointerEvents: 'none',
                            zIndex: 5
                        }}>
                        </div>
                        {isEditing && (
                            <div style={{
                                position: 'absolute',
                                left: `${(b / verseCount) * 100}%`,
                                bottom: 'calc(100% + 10px)',
                                transform: 'translateX(-50%)',
                                background: '#333',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                zIndex: 20,
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                {b} | {b + 1}
                            </div>
                        )}
                    </React.Fragment>
                ))}

                {isEditing && breaks.map(b => (
                    <button
                        key={`remove-${b}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemoveBreak(b);
                        }}
                        style={{
                            position: 'absolute',
                            left: `${(b / verseCount) * 100}%`,
                            top: '100%',
                            transform: 'translateX(-50%)',
                            marginTop: '4px',
                            background: 'var(--danger)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            cursor: 'pointer',
                            zIndex: 10
                        }}
                    >
                        <X size={12} />
                    </button>
                ))}

                {isEditing && hoverVal && !breaks.includes(hoverVal) && (
                    <div style={{
                        position: 'absolute',
                        left: `${(hoverVal / verseCount) * 100}%`,
                        height: '100%',
                        width: '2px',
                        background: 'var(--accent)',
                        opacity: 0.5,
                        pointerEvents: 'none',
                        transform: 'translateX(-50%)',
                        zIndex: 20
                    }}>
                        <div style={{
                            position: 'absolute',
                            bottom: 'calc(100% + 10px)',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#333',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                            {hoverVal} | {hoverVal + 1}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
