import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
    SplitSquareHorizontal, Check, PenTool, X, Trash2, Plus, Minus, ImageIcon
} from 'lucide-react';
import MindmapViewer from '../MindmapViewer';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';

export type AnchorBuilderState = { breaks: number[]; labels: Record<number, string> };

export function MobileAnchorBuilder({
    surahId,
    verseCount,
    builderState,
    mindmapImageUrl,
    mindmapImageUrlDark,
    snapshot,
    isDark,
    showMindmapPreview = true,
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
    snapshot?: any;
    isDark?: boolean;
    showMindmapPreview?: boolean;
    onAddBreak: (val: number) => void;
    onRemoveBreak: (val: number) => void;
    onSave: () => Promise<void> | void;
    hasReviewedHistory: boolean;
}) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [currentSplitPoint, setCurrentSplitPoint] = useState<number>(1);
    const [isEditing, setIsEditing] = useState(false);
    const [showFullMindmap, setShowFullMindmap] = useState(false);
    const { confirm } = useConfirmDialog();
    const [zoomLevel, setZoomLevel] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const displayUrl = isDark ? (mindmapImageUrlDark || mindmapImageUrl) : (mindmapImageUrl || mindmapImageUrlDark);
    const shouldShowPreview = showMindmapPreview && !!displayUrl;
    const hasMindmap = !!(snapshot || displayUrl);

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
    if (showFullMindmap && shouldShowPreview) {
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
                    {shouldShowPreview && (
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
                    {shouldShowPreview && (
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
                        className="btn btn-secondary btn-full std-normal-btn"
                        onClick={async () => {
                            if (hasReviewedHistory) {
                                const ok = await confirm({
                                    title: 'Confirm Split Changes',
                                    message: 'This surah has verse chunks that have already been reviewed. Modifying splits will reset review progress for these chunks. Do you want to proceed?',
                                    confirmLabel: 'Proceed',
                                    isDestructive: true,
                                });
                                if (!ok) return;
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
                flexDirection: 'column',
                gap: '0.6rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>Editing Splits</span>
                    <button
                        className="btn btn-primary btn-sm std-normal-btn"
                        onClick={async () => {
                            if (isSaving) return;
                            setIsSaving(true);
                            try {
                                await onSave();
                                setIsEditing(false);
                            } catch (err) {
                                console.error('Failed to save splits', err);
                            } finally {
                                setIsSaving(false);
                            }
                        }}
                        disabled={isSaving}
                    >
                        <Check size={16} style={{ marginRight: 6 }} />
                        {isSaving ? 'Saving...' : 'Confirm'}
                    </button>
                </div>

                {/* Mindmap Preview (Sticky) */}
                {hasMindmap && (
                    <div
                        style={{
                            height: '190px',
                            background: 'var(--background-secondary)',
                            position: 'relative',
                            zIndex: 30,
                            flexShrink: 0,
                            padding: '8px',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            overflow: 'hidden'
                        }}
                    >
                        <MindmapViewer
                            snapshot={snapshot}
                            imageUrl={mindmapImageUrl || undefined}
                            imageUrlDark={mindmapImageUrlDark || undefined}
                            isDark={isDark || false}
                            title="Reference Map"
                            height="100%"
                        />
                    </div>
                )}
            </div>

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
                        paddingTop: hasMindmap ? '0px' : '50vh',
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
    onSave: () => Promise<void> | void;
    hasReviewedHistory: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [hoverVal, setHoverVal] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [hoveredCompactSegment, setHoveredCompactSegment] = useState<{
        start: number;
        end: number;
        centerPercent: number;
    } | null>(null);
    const [trackViewportWidth, setTrackViewportWidth] = useState(0);
    const barRef = useRef<HTMLDivElement>(null);
    const trackViewportRef = useRef<HTMLDivElement>(null);
    const { confirm } = useConfirmDialog();

    const breaks = Array.from(new Set([...builderState.breaks]))
        .sort((a, b) => a - b)
        .filter(b => b > 0 && b < verseCount);

    const boundaries = Array.from(new Set([1, ...breaks.map(b => b + 1), verseCount + 1])).sort((a, b) => a - b);
    const MIN_SPLIT_GAP_PX = 56;

    useEffect(() => {
        const el = trackViewportRef.current;
        if (!el) return;

        const updateWidth = () => setTrackViewportWidth(el.clientWidth);
        updateWidth();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateWidth);
            return () => window.removeEventListener('resize', updateWidth);
        }

        const observer = new ResizeObserver(updateWidth);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    let minBreakGapPx = Number.POSITIVE_INFINITY;
    if (breaks.length > 1 && trackViewportWidth > 0) {
        for (let i = 1; i < breaks.length; i += 1) {
            const gapVerses = breaks[i] - breaks[i - 1];
            const gapPx = (gapVerses / verseCount) * trackViewportWidth;
            if (gapPx < minBreakGapPx) {
                minBreakGapPx = gapPx;
            }
        }
    }

    const shouldEnableHorizontalScroll =
        isEditing &&
        Number.isFinite(minBreakGapPx) &&
        minBreakGapPx < MIN_SPLIT_GAP_PX;

    const widthExpansionFactor = shouldEnableHorizontalScroll
        ? Math.min(4, Math.max(1.15, MIN_SPLIT_GAP_PX / Math.max(minBreakGapPx, 1)))
        : 1;

    const trackWidthStyle = shouldEnableHorizontalScroll && trackViewportWidth > 0
        ? `${Math.round(trackViewportWidth * widthExpansionFactor)}px`
        : '100%';

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
        <div className="anchor-builder-desktop" style={{ padding: '1rem', background: 'var(--background-secondary)', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ background: 'var(--accent)', color: 'white', padding: '5px', borderRadius: '8px', display: 'flex' }}>
                        <SplitSquareHorizontal size={18} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>Define Splits</span>
                </div>
                {!isEditing ? (
                    <button
                        className="btn btn-secondary std-normal-btn"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                        onClick={async () => {
                            if (hasReviewedHistory) {
                                const ok = await confirm({
                                    title: 'Confirm Split Changes',
                                    message: 'This surah has verse chunks that have already been reviewed. Modifying splits will reset review progress for these chunks. Do you want to proceed?',
                                    confirmLabel: 'Proceed',
                                    isDestructive: true,
                                });
                                if (!ok) return;
                            }
                            setIsEditing(true);
                        }}
                    >
                        Edit Splits
                    </button>
                ) : (
                    <button className="btn btn-primary std-normal-btn" onClick={async () => {
                        if (isSaving) return;
                        setIsSaving(true);
                        try {
                            await onSave();
                            setIsEditing(false);
                        } catch (err) {
                            console.error('Failed to save splits', err);
                        } finally {
                            setIsSaving(false);
                        }
                    }} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Confirm Changes'}
                    </button>
                )}
            </div>

            <div
                ref={trackViewportRef}
                style={{
                    overflowX: shouldEnableHorizontalScroll ? 'auto' : 'hidden',
                    overflowY: shouldEnableHorizontalScroll ? 'hidden' : 'visible',
                    marginTop: '1rem',
                    marginBottom: '1rem',
                    // Reserve space for floating split/hover labels so they remain visible
                    // when horizontal scrolling is enabled.
                    paddingTop: isEditing ? '34px' : 0,
                    paddingBottom: isEditing ? '28px' : 0,
                }}
            >
                <div
                    className="anchor-bar-track"
                    ref={barRef}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onClick={handleClick}
                    style={{
                        position: 'relative',
                        height: '40px',
                        width: trackWidthStyle,
                        background: isEditing ? 'rgba(0,0,0,0.1)' : 'var(--background)',
                        borderRadius: '8px',
                        cursor: isEditing ? 'pointer' : 'default',
                        border: '1px solid var(--border)'
                    }}
                >
                {boundaries.slice(0, -1).map((start, idx) => {
                    const end = boundaries[idx + 1] - 1;
                    const widthPercent = ((end - start + 1) / verseCount) * 100;
                    const leftPercent = ((start - 1) / verseCount) * 100;
                    const centerPercent = leftPercent + widthPercent / 2;
                    const segmentPixelWidth = trackViewportWidth > 0
                        ? (trackViewportWidth * (end - start + 1)) / verseCount
                        : Number.POSITIVE_INFINITY;
                    const labelFontSize = segmentPixelWidth < 56
                        ? '0.62rem'
                        : segmentPixelWidth < 90
                            ? '0.68rem'
                            : '0.75rem';
                    const labelFontPx = parseFloat(labelFontSize) * 16;
                    const fullRangeText = `${start}-${end}`;
                    const estimatedCharWidth = labelFontPx * 0.56;
                    const labelPadding = segmentPixelWidth < 56 ? '1px 4px' : '2px 6px';
                    const paddingX = segmentPixelWidth < 56 ? 4 : 6;
                    const labelText = segmentPixelWidth < 36 ? `${start}` : `${start}-${end}`;
                    const shouldRenderLabel = segmentPixelWidth >= 24;
                    const isUltraCompact = segmentPixelWidth < 24;
                    const estimatedFullLabelWidth =
                        fullRangeText.length * estimatedCharWidth + (paddingX * 2) + 4;
                    const isFullLabelVisible =
                        segmentPixelWidth >= 36 && segmentPixelWidth >= estimatedFullLabelWidth;
                    const shouldUseHoverWindow = !isEditing && !isFullLabelVisible;

                    return (
                        <div key={`seg-${start}`} style={{
                            position: 'absolute',
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: isEditing ? 'none' : 'auto',
                            borderRight: idx < boundaries.length - 2 ? '1px solid var(--border)' : 'none'
                        }}
                            onMouseEnter={() => {
                                if (shouldUseHoverWindow) {
                                    setHoveredCompactSegment({ start, end, centerPercent });
                                }
                            }}
                            onMouseLeave={() => {
                                setHoveredCompactSegment(prev => (
                                    prev?.start === start && prev?.end === end ? null : prev
                                ));
                            }}
                            onFocus={() => {
                                if (shouldUseHoverWindow) {
                                    setHoveredCompactSegment({ start, end, centerPercent });
                                }
                            }}
                            onBlur={() => {
                                setHoveredCompactSegment(prev => (
                                    prev?.start === start && prev?.end === end ? null : prev
                                ));
                            }}
                            tabIndex={!isEditing ? 0 : -1}
                            aria-label={`Verses ${start} to ${end}`}
                        >
                            {!isEditing && shouldRenderLabel && (
                                <span
                                    title={shouldUseHoverWindow ? `${start}-${end}` : undefined}
                                    style={{
                                        fontSize: labelFontSize,
                                        color: 'var(--foreground-secondary)',
                                        background: 'var(--background-secondary)',
                                        padding: labelPadding,
                                        borderRadius: '4px',
                                        maxWidth: 'calc(100% - 4px)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        display: 'inline-block'
                                    }}
                                >
                                    {labelText}
                                </span>
                            )}
                            {!isEditing && isUltraCompact && (
                                <button
                                    type="button"
                                    onMouseEnter={() => setHoveredCompactSegment({ start, end, centerPercent })}
                                    onMouseLeave={() => {
                                        setHoveredCompactSegment(prev => (
                                            prev?.start === start && prev?.end === end ? null : prev
                                        ));
                                    }}
                                    onFocus={() => setHoveredCompactSegment({ start, end, centerPercent })}
                                    onBlur={() => {
                                        setHoveredCompactSegment(prev => (
                                            prev?.start === start && prev?.end === end ? null : prev
                                        ));
                                    }}
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '999px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--background-secondary)',
                                        color: 'var(--foreground-secondary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.7rem',
                                        lineHeight: 1,
                                        padding: 0,
                                        cursor: 'help',
                                        zIndex: 2
                                    }}
                                    aria-label={`Show full split ${start}-${end}`}
                                    title={`${start}-${end}`}
                                >
                                    •
                                </button>
                            )}
                        </div>
                    );
                })}

                {!isEditing && hoveredCompactSegment && (
                    <div
                        style={{
                            position: 'absolute',
                            left: `${hoveredCompactSegment.centerPercent}%`,
                            top: '-34px',
                            transform: 'translateX(-50%)',
                            background: '#333',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            zIndex: 30,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                            pointerEvents: 'none'
                        }}
                    >
                        {hoveredCompactSegment.start}-{hoveredCompactSegment.end}
                    </div>
                )}

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
        </div>
    );
}
