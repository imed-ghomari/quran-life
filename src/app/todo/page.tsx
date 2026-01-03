'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { SURAHS, getSurah, getSurahsByPart, parseQuranJson } from '@/lib/quranData';
import {
    getMindMaps,
    getMindMap,
    saveMindMap,
    getPartMindMaps,
    getPartMindMap,
    savePartMindMap,
    getSettings,
    getReviewErrors,
    getSuspendedAnchors,
    clearAnchorIssues,
    getMutashabihatDecisions,
    setMutashabihatDecision,
    getCustomMutashabihat,
    saveCustomMutashabih,
    CustomMutashabih,
    isSurahSkipped,
    MutashabihatDecision,
    getMemoryNodes,
} from '@/lib/storage';
import { getMutashabihatForAbsolute, absoluteToSurahAyah } from '@/lib/mutashabihat';
import { QuranPart } from '@/lib/types';
import { syncWithCloud } from '@/lib/sync';
import { ChevronDown, Brain, Map, MapPinned, AlertTriangle, ShieldAlert, SplitSquareHorizontal, Check, ImageIcon, ChevronRight, X, AlertCircle, Download, Upload, MoreVertical, FileText, Settings2, PenTool, Trash2, Plus, Minus, Info } from 'lucide-react';
import MindmapEditor from '@/components/MindmapEditor';
import { appLogger } from '@/lib/logger';
import Link from 'next/link';

const MUT_STATES: { value: MutashabihatDecision['status']; label: string }[] = [
    { value: 'pending', label: 'Pending Review' },
    { value: 'ignored', label: 'Ignored (Not similar)' },
    { value: 'solved_mindmap', label: 'Solved by Mindmap' },
    { value: 'solved_note', label: 'Solved by Note' },
];

/**
 * Renders Arabic text with highlighted word ranges
 */
function HighlightedVerse({ text, range }: { text: string; range?: [number, number] }) {
    if (!range) return <>{text}</>;
    const words = text.trim().split(/\s+/);
    return (
        <>
            {words.map((word, idx) => {
                const wordNum = idx + 1;
                const isHighlighted = wordNum >= range[0] && wordNum <= range[1];
                return (
                    <span key={idx} className={isHighlighted ? 'mut-word-highlight' : ''}>
                        {word}{' '}
                    </span>
                );
            })}
        </>
    );
}

type AnchorBuilderState = { breaks: number[]; labels: Record<number, string> };

function MobileAnchorBuilder({
    surahId,
    verseCount,
    builderState,
    mindmapImageUrl,
    onAddBreak,
    onRemoveBreak,
    onSave,
    hasReviewedHistory,
}: {
    surahId: number;
    verseCount: number;
    builderState: AnchorBuilderState;
    mindmapImageUrl?: string | null;
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

    // IntersectionObserver handles update now
    // const handleScroll = () => { ... }; 

    // Full Screen Mindmap Overlay
    if (showFullMindmap && mindmapImageUrl) {
        return (
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 100,
                    background: 'rgba(0,0,0,0.95)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                onClick={() => setShowFullMindmap(false)}
            >
                <div style={{ position: 'absolute', top: 20, right: 20, color: 'white', zIndex: 101, display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.max(0.5, z - 0.25)); }}
                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                        <Minus size={24} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setZoomLevel(z => Math.min(3, z + 0.25)); }}
                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                        <Plus size={24} />
                    </button>
                    <button
                        onClick={() => setShowFullMindmap(false)}
                        style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', marginLeft: '0.5rem' }}
                    >
                        <X size={32} />
                    </button>
                </div>
                <div style={{ width: '100%', height: '100%', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                        src={mindmapImageUrl}
                        alt="Full Mindmap"
                        style={{
                            maxWidth: zoomLevel <= 1 ? '100%' : 'none',
                            maxHeight: zoomLevel <= 1 ? '100%' : 'none',
                            objectFit: 'contain',
                            transform: `scale(${zoomLevel})`,
                            transition: 'transform 0.2s ease-out',
                            cursor: zoomLevel > 1 ? 'grab' : 'default'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
                <span style={{ position: 'absolute', bottom: 30, color: 'white', background: 'rgba(0,0,0,0.5)', padding: '8px 16px', borderRadius: '20px' }}>
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
                    {mindmapImageUrl && (
                        <div
                            style={{
                                height: '150px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                background: '#000',
                                position: 'relative',
                                cursor: 'pointer'
                            }}
                            onClick={() => setShowFullMindmap(true)}
                        >
                            <img
                                src={mindmapImageUrl}
                                alt="Mindmap Preview"
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                            <div style={{
                                position: 'absolute',
                                bottom: 8,
                                right: 8,
                                background: 'rgba(0,0,0,0.6)',
                                color: 'white',
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
            {mindmapImageUrl && (
                <div
                    style={{
                        height: '80px',
                        background: '#000',
                        position: 'relative',
                        zIndex: 30,
                        flexShrink: 0,
                        cursor: 'pointer'
                    }}
                    onClick={() => setShowFullMindmap(true)}
                >
                    <img
                        src={mindmapImageUrl}
                        alt="Mindmap Preview"
                        style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.8 }}
                    />
                    <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '4px' }}>
                        <ImageIcon size={10} color="white" />
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

                            // We render the Verse, and then the Gap AFTER it.
                            // The Gap is the snap target.
                            // Gap `vNum` represents the split AFTER vNum (Between vNum & vNum+1)

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
                                            // Dim verses that are far from center? 
                                            // Actually, since we snap to GAP, verses will be above/below center.
                                            // Let's keep opacity high for neighbors.
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
                                    {/* Only render gap if not the last verse (cannot split after last) */}
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

function DesktopAnchorBuilder({
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

    // Ensure boundaries are unique
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
                {/* Visual Segments and Labels (When not editing or always?) - Always show segments */}
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

                {/* Existing Breaks Indicators */}
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

                {/* X Buttons (Only when editing) */}
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

                {/* Hover Indicator */}
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

export default function TodoPage() {
    const [mindmaps, setMindmaps] = useState(getMindMaps());
    const [partMindmaps, setPartMindmaps] = useState(getPartMindMaps());
    const [settingsVersion, setSettingsVersion] = useState(0);
    const [anchorBuilders, setAnchorBuilders] = useState<Record<number, AnchorBuilderState>>({});
    const [fixDrafts, setFixDrafts] = useState<Record<string, string>>({});
    const [decisions, setDecisions] = useState<Record<string, any>>(getMutashabihatDecisions());
    const [verses, setVerses] = useState<{ surahId: number; ayahId: number; text: string }[]>([]);

    // Default main sections to open
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        'maintenance': true,
        'construction': true
    });

    // Expansion states
    const [expandedSurahs, setExpandedSurahs] = useState<Record<number, boolean>>({});
    const [expandedMutItems, setExpandedMutItems] = useState<Record<string, boolean>>({});

    // Mobile Slide-over State
    type SlideOverType = 'suspended' | 'similar' | 'part' | 'surah';
    type SlideOverState = {
        type: SlideOverType;
        title: string;
        data?: any;
    } | null;
    const [activeSlideOver, setActiveSlideOver] = useState<SlideOverState>(null);

    // Mindmap Editor State (for Surah and Part mindmaps)
    const [activeMindmapEditor, setActiveMindmapEditor] = useState<{ surahId: number; snapshot?: any } | null>(null);
    const [activePartEditor, setActivePartEditor] = useState<{ partId: QuranPart; snapshot?: any } | null>(null);

    // Default subsections to collapsed
    const [collapsedSubgroups, setCollapsedSubgroups] = useState<Record<string, boolean>>({
        'suspended': true,
        'similar': true,
        'part': true,
        'surah': true
    });

    const toggleSubgroup = (group: string) => {
        setCollapsedSubgroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const hasReviewedChunks = (surahId: number) => {
        const nodes = getMemoryNodes();
        return nodes.some(n => n.type === 'verse' && n.surahId === surahId && (n.scheduler.repetition > 0 || !!n.scheduler.lastReview));
    };

    useEffect(() => {
        // No longer forcing false on mobile since it's now false by default
    }, []);

    const settings = getSettings();

    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === null || e.key.startsWith('quran-app-')) {
                setSettingsVersion(v => v + 1);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    useEffect(() => {
        setMindmaps(getMindMaps());
        setPartMindmaps(getPartMindMaps());
        setDecisions(getMutashabihatDecisions());
    }, [settingsVersion]);

    useEffect(() => {
        fetch('/qpc-hafs-word-by-word.json')
            .then(res => res.json())
            .then(data => setVerses(parseQuranJson(data as Record<string, any>)))
            .catch(() => setVerses([]));
    }, []);

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const toggleSurahExpand = (id: number) => setExpandedSurahs(prev => ({ ...prev, [id]: !prev[id] }));

    const activePart = settings.activePart;

    const surahTasks = useMemo(() => {
        const learnedSurahIds = new Set(Object.keys(settings.learnedVerses).map(id => parseInt(id)));
        const eligible = SURAHS.filter(s =>
            (activePart === 5 || s.part === activePart) &&
            !isSurahSkipped(s.id) &&
            learnedSurahIds.has(s.id)
        );
        return eligible
            .map(s => ({ surah: s, mindmap: mindmaps[s.id] }))
            .sort((a, b) => a.surah.id - b.surah.id);
    }, [mindmaps, settingsVersion, activePart, settings.learnedVerses, settings.skippedSurahs]);

    const incompleteSurahMaps = surahTasks.filter(t => !t.mindmap || !t.mindmap.isComplete || !t.mindmap.imageUrl);

    const partTasks = useMemo(() => {
        const parts: QuranPart[] = [1, 2, 3, 4];
        return parts.map(p => ({ part: p, mindmap: partMindmaps[p] }));
    }, [partMindmaps, settingsVersion]);

    const visiblePartTasks = useMemo(() => {
        return activePart === 5 ? partTasks : partTasks.filter(t => t.part === activePart);
    }, [partTasks, activePart]);

    const incompletePartMapsCount = useMemo(() => {
        return (activePart === 5 ? partTasks : partTasks.filter(t => t.part === activePart)).filter(({ mindmap }) => {
            const hasContent = !!mindmap?.imageUrl || !!mindmap?.tldrawSnapshot;
            const isComplete = !!mindmap?.isComplete && hasContent;
            return !isComplete;
        }).length;
    }, [partTasks, activePart]);

    const suspendedAnchors = getSuspendedAnchors();

    const reviewErrors = getReviewErrors().filter(e => e.absoluteAyah);
    const similarityItems = reviewErrors
        .map(err => {
            const absolute = err.absoluteAyah!;
            const muts = getMutashabihatForAbsolute(absolute);
            return { err, muts };
        })
        .filter(entry => entry.muts.length > 0)
        .filter(entry => {
            const absolute = entry.err.absoluteAyah!;
            // Check if generic verse decision exists and is confirmed or ignored
            const verseDecision = decisions[absolute.toString()];
            if (verseDecision?.status === 'ignored' || !!verseDecision?.confirmedAt) return false;

            // Check if any specific phrase decisions are confirmed
            const anyPhraseConfirmed = entry.muts.some((m: any) => {
                const phraseDecision = decisions[`${absolute}-${m.phraseId}`];
                return !!phraseDecision?.confirmedAt;
            });

            return !anyPhraseConfirmed;
        });

    const groupedSimilarity = useMemo(() => {
        const groups: Record<number, typeof similarityItems> = {};
        similarityItems.forEach(item => {
            const ref = absoluteToSurahAyah(item.err.absoluteAyah!);
            if (!groups[ref.surahId]) groups[ref.surahId] = [];
            groups[ref.surahId].push(item);
        });
        return Object.entries(groups).map(([surahId, items]) => ({
            surah: getSurah(parseInt(surahId)),
            items,
            count: items.length
        })).filter(g => g.surah);
    }, [similarityItems]);

    const isFixEmpty = suspendedAnchors.length === 0;
    const isSimilarityEmpty = groupedSimilarity.length === 0;
    const isIncompleteSurahsEmpty = incompleteSurahMaps.length === 0;
    const isAllDone = isFixEmpty && isSimilarityEmpty && isIncompleteSurahsEmpty;

    const handleSurahImageUpdate = (surahId: number, file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const imageUrl = reader.result as string;
            const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
            saveMindMap({ ...existing, imageUrl, isComplete: !!imageUrl && existing.isComplete });
            setSettingsVersion(v => v + 1);
        };
        reader.readAsDataURL(file);
    };

    const getBuilderState = (surahId: number) => {
        if (anchorBuilders[surahId]) return anchorBuilders[surahId];
        const surahMeta = SURAHS.find(s => s.id === surahId);
        const verseCount = surahMeta?.verseCount || 1;
        const mindmap = mindmaps[surahId];
        if (mindmap?.anchors?.length) {
            const sorted = [...mindmap.anchors].sort((a, b) => a.startVerse - b.startVerse);
            const breaks = sorted.slice(0, -1).map(a => Math.min(Math.max(1, a.endVerse + 1), verseCount - 1));
            const labels: Record<number, string> = {};
            sorted.forEach((a, idx) => { labels[idx] = a.label; });
            return { breaks, labels };
        }
        return { breaks: [], labels: {} };
    };

    const handleAddPointer = (surahId: number, verseCount: number) => {
        const current = getBuilderState(surahId);
        const sorted = [...current.breaks].sort((a, b) => a - b);
        const last = sorted[sorted.length - 1] || 0;
        const seed = Math.min(verseCount - 1, Math.max(last + 1, 1));
        const nextBreaks = Array.from(new Set([...current.breaks, seed])).sort((a, b) => a - b).filter(b => b > 0 && b < verseCount);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    };

    const handleMovePointer = (surahId: number, index: number, value: number, verseCount: number) => {
        const current = getBuilderState(surahId);
        const clamped = Math.min(Math.max(1, value), verseCount - 1);
        const nextBreaks = [...current.breaks];
        nextBreaks[index] = clamped;
        const uniqueSorted = Array.from(new Set(nextBreaks)).sort((a, b) => a - b);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: uniqueSorted } }));
    };

    const handleRemovePointer = (surahId: number, index: number) => {
        const current = getBuilderState(surahId);
        const nextBreaks = current.breaks.filter((_, i) => i !== index);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    };

    const handleAddBreak = (surahId: number, breakPoint: number) => {
        const current = getBuilderState(surahId);
        const nextBreaks = Array.from(new Set([...current.breaks, breakPoint])).sort((a, b) => a - b);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    };

    const handleRemoveBreakValue = (surahId: number, breakPoint: number) => {
        const current = getBuilderState(surahId);
        const nextBreaks = current.breaks.filter(b => b !== breakPoint);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    };

    const handleLabelChange = (surahId: number, segmentIndex: number, value: string) => {
        const current = getBuilderState(surahId);
        setAnchorBuilders(prev => ({
            ...prev,
            [surahId]: { ...current, labels: { ...current.labels, [segmentIndex]: value } },
        }));
    };

    const handleSaveAnchors = (surahId: number, verseCount: number) => {
        const builder = getBuilderState(surahId);
        const boundaries = [1, ...builder.breaks, verseCount + 1];
        const anchors = boundaries.slice(0, -1).map((start, idx) => {
            const end = boundaries[idx + 1] - 1;
            const label = builder.labels[idx] || `Verses ${start}-${end}`;
            return { start, end, label };
        });

        const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        const newAnchors = anchors.map(a => ({
            id: `anchor-${surahId}-${a.start}-${a.end}`,
            startVerse: a.start,
            endVerse: a.end,
            label: a.label,
        }));
        saveMindMap({ ...existing, anchors: newAnchors });
        setSettingsVersion(v => v + 1);
    };

    const handleMarkComplete = (surahId: number, currentMindmap?: any) => {
        // Use current state as base if available to prevent data loss from stale storage
        // Otherwise read from storage
        const freshMaps = getMindMaps();
        const existing = currentMindmap || freshMaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        // Ensure we preserve the image if it exists in either source
        const imageUrl = currentMindmap?.imageUrl || existing.imageUrl || null;
        const tldrawSnapshot = currentMindmap?.tldrawSnapshot || existing.tldrawSnapshot;

        const updated = {
            ...existing,
            imageUrl,
            tldrawSnapshot,
            isComplete: !existing.isComplete
        };

        saveMindMap(updated);

        // Update local state to reflect change immediately
        setMindmaps(prev => ({ ...prev, [surahId]: updated }));
        setSettingsVersion(v => v + 1);
        // syncWithCloud().catch(console.error);
    };

    const handleImportPremade = async (type: 'surah' | 'part', id: number) => {
        try {
            // Try fetching .json first (which may contain anchors and other metadata)
            // Fallback to .tldraw for raw exports
            let response = await fetch(`/assets/premade-mindmaps/${type}-${id}.json`);
            if (!response.ok) {
                response = await fetch(`/assets/premade-mindmaps/${type}-${id}.tldraw`);
            }

            if (!response.ok) {
                if (response.status === 404) {
                    alert(`Premade mindmap for this ${type} is not available yet.`);
                } else {
                    alert(`Failed to import mindmap: ${response.statusText}`);
                }
                return;
            }
            const data = await response.json();

            // Normalize data: it could be a raw tldraw JSON or a combined object { tldrawSnapshot, anchors, ... }
            const snapshot = data.tldrawSnapshot || (data.document ? data : null);
            const anchors = data.anchors || [];

            if (!snapshot) {
                alert('Invalid mindmap file format');
                return;
            }

            if (type === 'surah') {
                const existing = mindmaps[id] || { surahId: id, anchors: [], imageUrl: null, isComplete: false };
                const updated = {
                    ...existing,
                    tldrawSnapshot: snapshot,
                    anchors: anchors.length > 0 ? anchors : existing.anchors,
                    surahId: id,
                    isComplete: true
                };
                saveMindMap(updated);
                setMindmaps(prev => ({ ...prev, [id]: updated }));
            } else {
                const pId = id as QuranPart;
                const existing = partMindmaps[pId] || { partId: pId, description: '', imageUrl: null, isComplete: false };
                const updated = {
                    ...existing,
                    tldrawSnapshot: snapshot,
                    description: data.description || existing.description || '',
                    partId: pId,
                    isComplete: true
                };
                savePartMindMap(updated);
                setPartMindmaps(prev => ({ ...prev, [pId]: updated }));
            }
            appLogger.addLog(`Imported premade mindmap for ${type} ${id}`, 'success');
            setSettingsVersion(v => v + 1);
            alert(`Premade mindmap for ${type} ${id} successfully imported!${anchors.length > 0 ? ' (including verse chunks)' : ''}`);
        } catch (error) {
            console.error('Import failed:', error);
            alert('Failed to import mindmap. Please try again.');
        }
    };

    const handlePartMindmapUpdate = (part: QuranPart, file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const imageUrl = reader.result as string;
            const existing = partMindmaps[part] || { partId: part, imageUrl: null, description: '', isComplete: false };
            savePartMindMap({ ...existing, imageUrl, isComplete: !!imageUrl && existing.isComplete });
            setSettingsVersion(v => v + 1);
        };
        reader.readAsDataURL(file);
    };

    const handlePartComplete = (part: QuranPart) => {
        // Read directly from storage to avoid stale state closures
        const freshMaps = getPartMindMaps();
        const existing = freshMaps[part] || { partId: part, imageUrl: null, description: '', isComplete: false };

        const updated = { ...existing, isComplete: !existing.isComplete };
        savePartMindMap(updated);

        // Update local state to reflect change immediately
        setPartMindmaps(prev => ({ ...prev, [part]: updated }));
        setSettingsVersion(v => v + 1);
        // syncWithCloud().catch(console.error);
    };

    const handleFixConfirm = (surahId: number, anchorId: string) => {
        // We assume the user has already edited the mindmap if needed.
        // This function just resolves the specific issue.
        clearAnchorIssues(surahId, anchorId);
        setSettingsVersion(v => v + 1);
        // syncWithCloud().catch(console.error);
    };

    const handleSimilarityDecision = (absoluteAyah: number, status: MutashabihatDecision['status'], phraseId?: string, confirm: boolean = true) => {
        if (phraseId?.startsWith('custom-')) {
            const customId = phraseId.replace('custom-', '');
            const allCustoms = getCustomMutashabihat();
            const mut = allCustoms.find((m: CustomMutashabih) => m.id === customId);
            if (mut) {
                mut.status = status;
                saveCustomMutashabih(mut);
            }
        }

        const key = phraseId ? `${absoluteAyah}-${phraseId}` : absoluteAyah.toString();
        const existing = decisions[key] || { status: 'pending', note: '' };
        setMutashabihatDecision(key as any, {
            ...existing,
            status,
            confirmedAt: confirm ? new Date().toISOString() : existing.confirmedAt
        });
        setSettingsVersion(v => v + 1);
    };

    const handleEditorSave = async (snapshot: any, images?: { light?: Blob, dark?: Blob }) => {
        if (!activeMindmapEditor) return;
        const { surahId } = activeMindmapEditor;

        const save = (lightUrl: string | null, darkUrl: string | null) => {
            const existing = getMindMap(surahId);
            const updated = {
                ...existing,
                imageUrl: lightUrl || existing.imageUrl,
                imageUrlDark: darkUrl || existing.imageUrlDark,
                tldrawSnapshot: snapshot
            };
            saveMindMap(updated);
            setMindmaps(prev => ({ ...prev, [surahId]: updated }));
            setSettingsVersion(v => v + 1);
            setActiveMindmapEditor(null);
            // syncWithCloud().catch(console.error);
        };

        if (images && (images.light || images.dark)) {
            const blobs = images;

            const processBlob = (blob: Blob | undefined): Promise<string | null> => {
                if (!blob) return Promise.resolve(null);
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            };

            const [light, dark] = await Promise.all([
                processBlob(blobs.light),
                processBlob(blobs.dark)
            ]);
            save(light, dark);
        } else {
            save(null, null);
        }
    };

    const handlePartEditorSave = async (snapshot: any, images?: { light?: Blob, dark?: Blob }) => {
        if (!activePartEditor) return;
        const { partId } = activePartEditor;

        const save = (lightUrl: string | null, darkUrl: string | null) => {
            const existing = getPartMindMap(partId);
            const updated = {
                ...existing,
                imageUrl: lightUrl || existing.imageUrl,
                imageUrlDark: darkUrl || existing.imageUrlDark,
                tldrawSnapshot: snapshot
            };
            savePartMindMap(updated);
            setPartMindmaps(prev => ({ ...prev, [partId]: updated }));
            setSettingsVersion(v => v + 1);
            setActivePartEditor(null);
            // syncWithCloud().catch(console.error);
        };

        if (images && (images.light || images.dark)) {
            const blobs = images;

            const processBlob = (blob: Blob | undefined): Promise<string | null> => {
                if (!blob) return Promise.resolve(null);
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            };

            const [light, dark] = await Promise.all([
                processBlob(blobs.light),
                processBlob(blobs.dark)
            ]);
            save(light, dark);
        } else {
            save(null, null);
        }
    };

    return (
        <div className="content-wrapper" style={{ padding: '1rem', margin: '0 auto' }}>
            {/* Surah Mindmap Editor */}
            {activeMindmapEditor && (
                <MindmapEditor
                    initialSnapshot={activeMindmapEditor.snapshot}
                    onSave={handleEditorSave}
                    onClose={() => setActiveMindmapEditor(null)}
                    title="Surah Mindmap Editor"
                />
            )}
            {/* Part Mindmap Editor */}
            {activePartEditor && (
                <MindmapEditor
                    initialSnapshot={activePartEditor.snapshot}
                    onSave={handlePartEditorSave}
                    onClose={() => setActivePartEditor(null)}
                    title={`Part ${activePartEditor.partId} Mindmap Editor`}
                />
            )}
            <h1 className="hide-mobile">Todo</h1>

            {/* Maintenance Section */}
            <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                <div
                    onClick={() => toggleGroup('maintenance')}
                    style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0',
                        marginBottom: expandedGroups['maintenance'] ? '1.5rem' : '0'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
                            <ShieldAlert size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Review Fixes</h2>
                                <span className="status-badge" style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                                    {suspendedAnchors.length + similarityItems.length}
                                </span>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)', margin: 0 }}>Maintenance: Resolve issues and similarity confusion</p>
                        </div>
                    </div>
                    <ChevronDown size={20} style={{ transform: expandedGroups['maintenance'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>



                {expandedGroups['maintenance'] && (
                    <>
                        {/* Desktop View */}
                        <div className="hide-mobile" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
                            <table className="debug-table" style={{ minWidth: '800px', width: '100%', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '25%', textAlign: 'left' }}>Target</th>
                                        <th style={{ width: '40%', textAlign: 'left' }}>Detail</th>
                                        <th style={{ width: '15%', textAlign: 'left' }}>Status</th>
                                        <th style={{ width: '20%', textAlign: 'left' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Suspended Anchors Sub-section */}
                                    <tr className="subgroup-header" onClick={() => toggleSubgroup('suspended')}>
                                        <td colSpan={4} style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit' }}>
                                                {collapsedSubgroups['suspended'] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                <AlertTriangle size={14} /> Suspended Anchors
                                                <span className="status-badge" style={{ fontSize: '0.65rem', opacity: 0.8, marginLeft: '0.5rem' }}>
                                                    {suspendedAnchors.length}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    {!collapsedSubgroups['suspended'] && (
                                        suspendedAnchors.length === 0 ? (
                                            <tr className="node-row">
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--success)' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Check size={24} />
                                                        <span style={{ fontWeight: 600 }}>No suspended anchors! Great job.</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            suspendedAnchors.map(issue => {
                                                const key = `${issue.surahId}-${issue.anchorId}`;
                                                const surah = getSurah(issue.surahId);
                                                const mindmap = mindmaps[issue.surahId];
                                                const chunkVerses = verses
                                                    .filter(v => v.surahId === issue.surahId && v.ayahId >= (issue.startVerse || 0) && v.ayahId <= (issue.endVerse || 0))
                                                    .map(v => v.text)
                                                    .join(' ');

                                                return (
                                                    <tr key={key} className="node-row">
                                                        <td style={{ fontWeight: 600 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                <div className="surah-number" style={{ background: 'var(--danger)', width: '2rem', height: '2rem', fontSize: '0.85rem' }}>{issue.surahId}</div>
                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <span className="surah-arabic" style={{ fontSize: '1rem' }}>{surah?.arabicName}</span>
                                                                    <span className="surah-english" style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)' }}>{surah?.name}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{issue.label}</span>
                                                                {chunkVerses && (
                                                                    <p className="arabic-text" style={{ fontSize: '0.9rem', color: 'var(--foreground-secondary)', margin: 0, opacity: 0.8, maxHeight: '3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {chunkVerses}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className="status-badge not-remembered" style={{ background: 'var(--danger)', color: 'white', fontSize: '0.75rem' }}>Suspended</span>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    onClick={() => setActiveMindmapEditor({ surahId: issue.surahId, snapshot: mindmap?.tldrawSnapshot })}
                                                                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', flex: 1 }}
                                                                >
                                                                    <PenTool size={14} style={{ marginRight: '4px' }} />
                                                                    Edit Map
                                                                </button>
                                                                <button
                                                                    className="btn btn-primary"
                                                                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', flex: 1 }}
                                                                    onClick={() => handleFixConfirm(issue.surahId, issue.anchorId)}
                                                                >
                                                                    <Check size={14} style={{ marginRight: '4px' }} /> Complete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )
                                    )}

                                    {/* Similarity Checks Sub-section */}
                                    <tr className="subgroup-header" onClick={() => toggleSubgroup('similar')}>
                                        <td colSpan={4} style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit' }}>
                                                {collapsedSubgroups['similar'] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                <Brain size={14} /> Similar Verses Checks
                                                <span className="status-badge" style={{ fontSize: '0.65rem', opacity: 0.8, marginLeft: '0.5rem' }}>
                                                    {similarityItems.length}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    {!collapsedSubgroups['similar'] && (
                                        groupedSimilarity.length === 0 ? (
                                            <tr className="node-row">
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--success)' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Check size={24} />
                                                        <span style={{ fontWeight: 600 }}>No similarity checks needed.</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            groupedSimilarity.map(({ surah, items, count }) => {
                                                const isSurahOpen = expandedSurahs[surah!.id] ?? false;
                                                return (
                                                    <React.Fragment key={surah!.id}>
                                                        <tr className="subgroup-header" onClick={() => setExpandedSurahs(prev => ({ ...prev, [surah!.id]: !isSurahOpen }))}>
                                                            <td colSpan={4} style={{ fontWeight: 600 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <ChevronDown size={14} style={{ transform: isSurahOpen ? 'rotate(180deg)' : 'none' }} />
                                                                    <div className="surah-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' }}>{surah!.id}</div>
                                                                    <span>{surah!.arabicName} — {surah!.name}</span>
                                                                    <span className="status-badge partial" style={{ fontSize: '0.65rem' }}>{count} items</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {isSurahOpen && items.map(({ err, muts }) => {
                                                            const abs = err.absoluteAyah!;
                                                            const ref = absoluteToSurahAyah(abs);
                                                            const baseVerse = verses.find(v => v.surahId === ref.surahId && v.ayahId === ref.ayahId);

                                                            return muts.map((entry: any) => {
                                                                const decisionKey = `${abs}-${entry.phraseId}`;
                                                                const existing = decisions[decisionKey] || { status: 'pending', note: '' };
                                                                const isConfirmed = !!existing.confirmedAt;
                                                                const isExpanded = expandedMutItems[decisionKey] || false;
                                                                const matches = entry.matches.filter((m: any) => m !== abs);
                                                                const visibleMatches = isExpanded ? matches : matches.slice(0, 2);

                                                                return (
                                                                    <tr key={decisionKey} className={`node-row ${isConfirmed ? 'confirmed' : ''}`}>
                                                                        <td style={{ verticalAlign: 'top' }}>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)' }}>Ayah {ref.ayahId}</span>
                                                                                {baseVerse && (
                                                                                    <p className="arabic-text" style={{ fontSize: '1rem', textAlign: 'right', margin: 0 }}>
                                                                                        <HighlightedVerse
                                                                                            text={baseVerse.text}
                                                                                            range={entry.meta.sourceAbs === abs ? entry.meta.sourceRange : entry.meta.matches.find((m: any) => m.absolute === abs)?.wordRange}
                                                                                        />
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td style={{ verticalAlign: 'top' }}>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                                                {visibleMatches.map((matchAbs: number, idx: number) => {
                                                                                    const mref = absoluteToSurahAyah(matchAbs);
                                                                                    const msurah = getSurah(mref.surahId);
                                                                                    const mVerse = verses.find(v => v.surahId === mref.surahId && v.ayahId === mref.ayahId);
                                                                                    const matchRange = entry.meta.matches.find((m: any) => m.absolute === matchAbs)?.wordRange;

                                                                                    return (
                                                                                        <div key={idx} style={{ padding: '0.5rem', background: 'var(--background)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                                                                            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--foreground-secondary)', marginBottom: '0.25rem' }}>
                                                                                                {msurah?.arabicName} {mref.ayahId}
                                                                                            </div>
                                                                                            {mVerse && (
                                                                                                <p className="arabic-text" style={{ fontSize: '0.9rem', textAlign: 'right', margin: 0 }}>
                                                                                                    <HighlightedVerse text={mVerse.text} range={matchRange} />
                                                                                                </p>
                                                                                            )}
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                                {matches.length > 2 && (
                                                                                    <button
                                                                                        className="btn btn-secondary"
                                                                                        style={{ padding: '0.25rem', fontSize: '0.7rem' }}
                                                                                        onClick={() => setExpandedMutItems(prev => ({ ...prev, [decisionKey]: !isExpanded }))}
                                                                                    >
                                                                                        {isExpanded ? 'Show Less' : `Show ${matches.length - 2} more...`}
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                                <select
                                                                                    value={existing.status}
                                                                                    onChange={e => handleSimilarityDecision(abs, e.target.value as any, entry.phraseId, false)}
                                                                                    style={{ width: '100%', padding: '0.4rem', borderRadius: '8px', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--background)' }}
                                                                                >
                                                                                    {MUT_STATES.map(s => (
                                                                                        <option key={s.value} value={s.value}>{s.label}</option>
                                                                                    ))}
                                                                                </select>
                                                                                {isConfirmed && (
                                                                                    <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600 }}>✓ Confirmed</span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td>
                                                                            <button
                                                                                className={`btn ${isConfirmed ? 'btn-secondary' : 'btn-primary'}`}
                                                                                onClick={() => handleSimilarityDecision(abs, existing.status, entry.phraseId, true)}
                                                                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', width: '100%' }}
                                                                            >
                                                                                {isConfirmed ? 'Update' : 'Confirm'}
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            });
                                                        })}
                                                    </React.Fragment>
                                                );
                                            })
                                        )
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile View List Lists */}
                        <div className="show-mobile">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                                {/* Suspended Anchors Mobile Group */}
                                <div className="mobile-group-item">
                                    <div className="mobile-group-header" onClick={() => toggleSubgroup('suspended')}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <AlertTriangle size={16} />
                                            <span style={{ fontWeight: 600 }}>Suspended Anchors</span>
                                            <span className={`status-badge ${suspendedAnchors.length === 0 ? 'learned' : 'not-remembered'}`}>
                                                {suspendedAnchors.length}
                                            </span>
                                        </div>
                                        {collapsedSubgroups['suspended'] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                    {!collapsedSubgroups['suspended'] && (
                                        <div className="mobile-subgroup-list">
                                            {suspendedAnchors.length === 0 ? (
                                                <div className="empty-state" style={{ padding: '1rem', fontSize: '0.85rem' }}>No suspended anchors!</div>
                                            ) : (
                                                suspendedAnchors.map(issue => {
                                                    const key = `${issue.surahId}-${issue.anchorId}`;
                                                    const surah = getSurah(issue.surahId);
                                                    const mindmap = mindmaps[issue.surahId];
                                                    const chunkVerses = verses
                                                        .filter(v => v.surahId === issue.surahId && v.ayahId >= (issue.startVerse || 0) && v.ayahId <= (issue.endVerse || 0))
                                                        .map(v => v.text)
                                                        .join(' ');

                                                    return (
                                                        <div key={key} className="mobile-subgroup-item" style={{ flexDirection: 'column', alignItems: 'flex-start', paddingLeft: '1rem', background: 'var(--background)' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '0.5rem' }}>
                                                                <div className="node-target" style={{ fontSize: '0.9rem' }}>{surah?.name} - {issue.label}</div>
                                                                <span className="status-badge not-remembered" style={{ fontSize: '0.7rem' }}>Suspended</span>
                                                            </div>
                                                            {chunkVerses && (
                                                                <p className="arabic-text" style={{ width: '100%', fontSize: '0.85rem', color: 'var(--foreground-secondary)', margin: '0 0 0.75rem 0', opacity: 0.8, textAlign: 'right' }}>
                                                                    {chunkVerses.slice(0, 100)}{chunkVerses.length > 100 ? '...' : ''}
                                                                </p>
                                                            )}
                                                            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    onClick={() => setActiveMindmapEditor({ surahId: issue.surahId, snapshot: mindmap?.tldrawSnapshot })}
                                                                    style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}
                                                                >
                                                                    <PenTool size={14} style={{ marginRight: '4px' }} />
                                                                    Edit Map
                                                                </button>
                                                                <button
                                                                    className="btn btn-primary"
                                                                    style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}
                                                                    onClick={() => handleFixConfirm(issue.surahId, issue.anchorId)}
                                                                >
                                                                    <Check size={14} /> Complete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Similarity Checks Mobile Group */}
                                <div className="mobile-group-item">
                                    <div className="mobile-group-header" onClick={() => toggleSubgroup('similar')}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Brain size={16} />
                                            <span style={{ fontWeight: 600 }}>Similarity Checks</span>
                                            <span className={`status-badge ${groupedSimilarity.length === 0 ? 'learned' : 'partial'}`}>
                                                {groupedSimilarity.length} Surahs
                                            </span>
                                        </div>
                                        {collapsedSubgroups['similar'] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                    {!collapsedSubgroups['similar'] && (
                                        <div className="mobile-subgroup-list">
                                            {groupedSimilarity.length === 0 ? (
                                                <div className="empty-state" style={{ padding: '1rem', fontSize: '0.85rem' }}>No checks needed.</div>
                                            ) : (
                                                groupedSimilarity.map(({ surah, items, count }) => (
                                                    <div key={surah!.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <div
                                                            className="mobile-subgroup-item"
                                                            onClick={() => toggleSurahExpand(surah!.id)}
                                                            style={{ paddingLeft: '1rem', background: 'var(--background-secondary)', justifyContent: 'space-between', borderTop: 'none' }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <div className="surah-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.7rem' }}>{surah!.id}</div>
                                                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{surah?.name}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)' }}>{count} items</span>
                                                                <ChevronDown size={16} style={{ transform: expandedSurahs[surah!.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                            </div>
                                                        </div>

                                                        {expandedSurahs[surah!.id] && (
                                                            <div style={{ background: 'var(--background)', padding: '0.5rem' }}>
                                                                {items.map(({ err, muts }) => {
                                                                    const abs = err.absoluteAyah!;
                                                                    const ref = absoluteToSurahAyah(abs);
                                                                    const baseVerse = verses.find(v => v.surahId === ref.surahId && v.ayahId === ref.ayahId);

                                                                    return muts.map((entry: any) => {
                                                                        const decisionKey = `${abs}-${entry.phraseId}`;
                                                                        const existing = decisions[decisionKey] || { status: 'pending', note: '' };
                                                                        const isConfirmed = !!existing.confirmedAt;
                                                                        const matches = entry.matches.filter((m: any) => m !== abs);

                                                                        // Mobile: show all matches to be safe, or just first 2 like desktop
                                                                        // Let's show first 2 to save space, and a toggle if needed? 
                                                                        // For simplicity in this fix, we'll just show up to 2.
                                                                        const visibleMatches = matches.slice(0, 2);

                                                                        return (
                                                                            <div key={decisionKey} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '0.75rem', background: 'var(--background)' }}>

                                                                                {/* Header: Ayah Number + Status */}
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)' }}>Ayah {ref.ayahId} Issue</span>
                                                                                    {isConfirmed && <span style={{ color: 'var(--success)', fontSize: '0.7rem' }}>✓ Confirmed</span>}
                                                                                </div>

                                                                                {/* Base Verse Context */}
                                                                                {baseVerse && (
                                                                                    <div style={{ marginBottom: '1rem', borderBottom: '1px dashed var(--border)', paddingBottom: '0.75rem' }}>
                                                                                        <p className="arabic-text" style={{ fontSize: '1rem', textAlign: 'right', margin: 0 }}>
                                                                                            <HighlightedVerse
                                                                                                text={baseVerse.text}
                                                                                                range={entry.meta.sourceAbs === abs ? entry.meta.sourceRange : entry.meta.matches.find((m: any) => m.absolute === abs)?.wordRange}
                                                                                            />
                                                                                        </p>
                                                                                    </div>
                                                                                )}

                                                                                {/* Confused With Section */}
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                                                                                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-secondary)', textTransform: 'uppercase' }}>Confused With:</span>
                                                                                    {visibleMatches.map((matchAbs: number, idx: number) => {
                                                                                        const mref = absoluteToSurahAyah(matchAbs);
                                                                                        const msurah = getSurah(mref.surahId);
                                                                                        const mVerse = verses.find(v => v.surahId === mref.surahId && v.ayahId === mref.ayahId);
                                                                                        const matchRange = entry.meta.matches.find((m: any) => m.absolute === matchAbs)?.wordRange;

                                                                                        return (
                                                                                            <div key={idx} style={{ padding: '0.5rem', background: 'var(--background-secondary)', borderRadius: '6px' }}>
                                                                                                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-secondary)', marginBottom: '0.25rem' }}>
                                                                                                    {msurah?.arabicName} {mref.ayahId}
                                                                                                </div>
                                                                                                {mVerse && (
                                                                                                    <p className="arabic-text" style={{ fontSize: '0.9rem', textAlign: 'right', margin: 0 }}>
                                                                                                        <HighlightedVerse text={mVerse.text} range={matchRange} />
                                                                                                    </p>
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                    {matches.length > 2 && (
                                                                                        <span style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--foreground-secondary)', textAlign: 'center' }}>
                                                                                            + {matches.length - 2} more...
                                                                                        </span>
                                                                                    )}
                                                                                </div>

                                                                                {/* Action Area */}
                                                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                                    <select
                                                                                        value={existing.status}
                                                                                        onChange={e => handleSimilarityDecision(abs, e.target.value as any, entry.phraseId, false)}
                                                                                        style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--background)' }}
                                                                                    >
                                                                                        {MUT_STATES.map(s => (
                                                                                            <option key={s.value} value={s.value}>{s.label}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                    <button
                                                                                        className={`btn ${isConfirmed ? 'btn-secondary' : 'btn-primary'}`}
                                                                                        onClick={() => handleSimilarityDecision(abs, existing.status, entry.phraseId, true)}
                                                                                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                                                                                    >
                                                                                        {isConfirmed ? 'Update' : 'Confirm'}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    });
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Construction Section */}
            <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                <div
                    onClick={() => toggleGroup('construction')}
                    style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0',
                        marginBottom: expandedGroups['construction'] ? '1.5rem' : '0'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'var(--background)', color: 'var(--foreground)', padding: '8px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex' }}>
                            <Map size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Study Progress</h2>
                                <span className="status-badge" style={{ fontSize: '0.7rem', color: 'var(--warning)', opacity: 0.8 }}>
                                    {incompletePartMapsCount + incompleteSurahMaps.length}
                                </span>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)', margin: 0 }}>Construction: Prepare mindmaps for your active parts</p>
                        </div>
                    </div>
                    <ChevronDown size={20} style={{ transform: expandedGroups['construction'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>

                {expandedGroups['construction'] && (
                    <>
                        {/* Desktop View */}
                        <div className="hide-mobile" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
                            <table className="debug-table" style={{ minWidth: '800px', width: '100%', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '25%', textAlign: 'left', paddingLeft: '1rem' }}>Target</th>
                                        <th style={{ width: '35%', textAlign: 'left' }}>Detail</th>
                                        <th style={{ width: '15%', textAlign: 'left' }}>Status</th>
                                        <th style={{ width: '25%', textAlign: 'right', paddingRight: '1rem' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Part Mindmaps Sub-section */}
                                    <tr className="subgroup-header" onClick={() => toggleSubgroup('part')}>
                                        <td colSpan={4} style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit' }}>
                                                {collapsedSubgroups['part'] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                <Map size={14} /> Part Mindmaps
                                                <span className="status-badge" style={{ fontSize: '0.65rem', color: 'var(--warning)', opacity: 0.8, marginLeft: '0.5rem' }}>
                                                    {incompletePartMapsCount}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    {!collapsedSubgroups['part'] && (
                                        visiblePartTasks.map(({ part, mindmap }) => {
                                            const isActive = activePart === 5 ? false : part === activePart;
                                            const hasContent = !!mindmap?.imageUrl || !!mindmap?.tldrawSnapshot;
                                            const isComplete = mindmap?.isComplete && hasContent;
                                            return (
                                                <tr key={part} className="node-row">
                                                    <td style={{ fontWeight: 600, paddingLeft: '1rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div className="surah-number" style={{ background: isActive ? 'var(--accent)' : 'var(--foreground-secondary)', width: '2rem', height: '2rem', fontSize: '0.85rem' }}>P{part}</div>
                                                            <span>Part {part}</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ textAlign: 'left' }}>
                                                        <span style={{ color: 'var(--foreground-secondary)', fontSize: '0.85rem' }}>
                                                            {getSurahsByPart(part).length} surahs
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'left' }}>
                                                        {isComplete ? (
                                                            <span className="status-badge learned" style={{ fontSize: '0.75rem' }}>Complete</span>
                                                        ) : (
                                                            <span className="status-badge partial" style={{ fontSize: '0.75rem' }}>Incomplete</span>
                                                        )}
                                                    </td>
                                                    <td style={{ paddingRight: '1rem' }}>
                                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => setActivePartEditor({ partId: part, snapshot: mindmap?.tldrawSnapshot })}
                                                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', minWidth: '80px', flex: 1 }}
                                                            >
                                                                <PenTool size={14} style={{ marginRight: '4px' }} />
                                                                {mindmap?.tldrawSnapshot ? 'Edit' : 'Create'}
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => handleImportPremade('part', part)}
                                                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                                                                title="Import Premade Mindmap"
                                                            >
                                                                <Download size={14} />
                                                            </button>
                                                            {hasContent && (
                                                                <Link
                                                                    href={`/docs/mindmaps/part-${part}`}
                                                                    className="btn btn-secondary"
                                                                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}
                                                                    title="View Documentation"
                                                                >
                                                                    <Info size={14} />
                                                                </Link>
                                                            )}
                                                            <button
                                                                className={`btn ${!hasContent ? 'btn-secondary' : 'btn-success'}`}
                                                                disabled={!hasContent}
                                                                onClick={() => handlePartComplete(part)}
                                                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', minWidth: '90px', flex: 1 }}
                                                            >
                                                                <Check size={14} /> {mindmap?.isComplete ? 'Done' : 'Complete'}
                                                            </button>
                                                            {/* Issue #5: Delete button for Part Mindmaps */}
                                                            {hasContent && (
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    onClick={() => {
                                                                        if (confirm('Are you sure you want to delete this part mindmap? This cannot be undone.')) {
                                                                            const newMaps = { ...partMindmaps };
                                                                            delete newMaps[part];
                                                                            setPartMindmaps(newMaps);
                                                                            savePartMindMap({ partId: part, imageUrl: null, imageUrlDark: null, description: '', isComplete: false, tldrawSnapshot: undefined, deletedAt: new Date().toISOString() });
                                                                            // syncWithCloud().catch(console.error);
                                                                        }
                                                                    }}
                                                                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                                                    title="Delete Mindmap"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}

                                    {/* Surah Mindmaps Sub-section */}
                                    <tr className="subgroup-header" onClick={() => toggleSubgroup('surah')}>
                                        <td colSpan={4} style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit' }}>
                                                {collapsedSubgroups['surah'] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                <MapPinned size={14} /> Surah Mindmaps
                                                <span className="status-badge" style={{ fontSize: '0.65rem', color: 'var(--warning)', opacity: 0.8, marginLeft: '0.5rem' }}>
                                                    {incompleteSurahMaps.length}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    {!collapsedSubgroups['surah'] && (
                                        surahTasks.length === 0 ? (
                                            <tr className="node-row">
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--success)' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Check size={24} />
                                                        <span style={{ fontWeight: 600 }}>No surahs in this part!</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            surahTasks.map(({ surah, mindmap }) => {
                                                const isExpanded = expandedSurahs[surah.id] || false;
                                                const hasContent = !!mindmap?.imageUrl || !!mindmap?.tldrawSnapshot;
                                                const isComplete = mindmap?.isComplete && hasContent;
                                                const hasImage = !!mindmap?.imageUrl;

                                                return (
                                                    <React.Fragment key={surah.id}>
                                                        <tr
                                                            className="node-row"
                                                            onClick={(e) => {
                                                                if (hasContent) {
                                                                    toggleSurahExpand(surah.id);
                                                                }
                                                            }}
                                                            style={{ cursor: hasContent ? 'pointer' : 'default' }}
                                                        >
                                                            <td style={{ fontWeight: 600, paddingLeft: '1rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                    <div className="surah-number" style={{ width: '2rem', height: '2rem', fontSize: '0.85rem' }}>{surah.id}</div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                        <span className="surah-arabic" style={{ fontSize: '1rem' }}>{surah.arabicName}</span>
                                                                        <span className="surah-english" style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)' }}>{surah.name}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td style={{ textAlign: 'left' }}>
                                                                <span style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)' }}>
                                                                    {mindmap?.anchors?.length || 0} anchors
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'left' }}>
                                                                <span className={`status-badge ${isComplete ? 'learned' : 'partial'}`} style={{ fontSize: '0.75rem' }}>
                                                                    {isComplete ? 'Complete' : 'Incomplete'}
                                                                </span>
                                                            </td>
                                                            <td style={{ paddingRight: '1rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                                    <button
                                                                        className="btn btn-secondary"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setActiveMindmapEditor({ surahId: surah.id, snapshot: mindmap?.tldrawSnapshot });
                                                                        }}
                                                                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem' }}
                                                                    >
                                                                        <PenTool size={12} style={{ marginRight: '4px' }} />
                                                                        {mindmap?.tldrawSnapshot ? 'Edit' : 'Start'}
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-secondary"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleImportPremade('surah', surah.id);
                                                                        }}
                                                                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem' }}
                                                                        title="Import Premade"
                                                                    >
                                                                        <Download size={12} />
                                                                    </button>
                                                                    {hasContent && (
                                                                        <Link
                                                                            href={`/docs/mindmaps/surah-${surah.id}`}
                                                                            className="btn btn-secondary"
                                                                            onClick={e => e.stopPropagation()}
                                                                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center' }}
                                                                            title="View Documentation"
                                                                        >
                                                                            <Info size={12} />
                                                                        </Link>
                                                                    )}
                                                                    <button
                                                                        className={`btn ${!hasContent ? 'btn-secondary' : isComplete ? 'btn-secondary' : 'btn-success'}`}
                                                                        disabled={!hasContent}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleMarkComplete(surah.id, mindmap);
                                                                        }}
                                                                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem' }}
                                                                    >
                                                                        <Check size={12} style={{ marginRight: '4px' }} />
                                                                        {isComplete ? 'Undo' : 'Done'}
                                                                    </button>

                                                                    {hasContent && (
                                                                        <>
                                                                            <button
                                                                                className="btn btn-secondary"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (confirm('Are you sure you want to delete this mindmap? This cannot be undone.')) {
                                                                                        const newMaps = { ...mindmaps };
                                                                                        delete newMaps[surah.id];
                                                                                        setMindmaps(newMaps);
                                                                                        saveMindMap({ ...mindmap, imageUrl: null, imageUrlDark: null, tldrawSnapshot: undefined, isComplete: false, deletedAt: new Date().toISOString() });
                                                                                        // syncWithCloud().catch(console.error);
                                                                                    }
                                                                                }}
                                                                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                                                                title="Delete Mindmap"
                                                                            >
                                                                                <Trash2 size={12} />
                                                                            </button>
                                                                            <div style={{ paddingLeft: '0.5rem', borderLeft: '1px solid var(--border)' }}>
                                                                                <ChevronDown size={18} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--foreground-secondary)' }} />
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {isExpanded && hasContent && (
                                                            <tr className="node-row expanded-content" onClick={e => e.stopPropagation()}>
                                                                <td colSpan={4} style={{ padding: '1.5rem', background: 'var(--background)' }}>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                                            {mindmap && (mindmap.imageUrl || mindmap.imageUrlDark) && (
                                                                                <div style={{ position: 'relative', width: '100%', height: '400px', marginBottom: '1rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                                                    <img src={mindmap.imageUrl ?? undefined} className="light-mode-only" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#f5f5f5' }} />
                                                                                    <img src={mindmap.imageUrlDark ?? mindmap.imageUrl ?? undefined} className="dark-mode-only" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#1e1e1e', filter: !mindmap.imageUrlDark && mindmap.imageUrl ? 'invert(0.9) hue-rotate(180deg)' : 'none' }} />
                                                                                </div>
                                                                            )}

                                                                            <DesktopAnchorBuilder
                                                                                surahId={surah.id}
                                                                                verseCount={surah.verseCount}
                                                                                builderState={getBuilderState(surah.id)}
                                                                                onAddBreak={(val) => handleAddBreak(surah.id, val)}
                                                                                onRemoveBreak={(val) => handleRemoveBreakValue(surah.id, val)}

                                                                                onSave={() => handleSaveAnchors(surah.id, surah.verseCount)}
                                                                                hasReviewedHistory={hasReviewedChunks(surah.id)}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })
                                        )
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile View List Lists */}
                        <div className="show-mobile">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                                {/* Part Mindmaps Mobile Group */}
                                <div className="mobile-group-item">
                                    <div className="mobile-group-header" onClick={() => toggleSubgroup('part')}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Map size={16} />
                                            <span style={{ fontWeight: 600 }}>Part Mindmaps</span>
                                            <span
                                                className={`status-badge ${visiblePartTasks.every(t => {
                                                    const hasContent = !!t.mindmap?.imageUrl || !!t.mindmap?.tldrawSnapshot;
                                                    return !!t.mindmap?.isComplete && hasContent;
                                                }) ? 'learned' : 'partial'}`}
                                            >
                                                {activePart === 5 ? 'All Quran' : `Part ${activePart}`}
                                            </span>
                                        </div>
                                        {collapsedSubgroups['part'] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                    {!collapsedSubgroups['part'] && (
                                        <div className="mobile-subgroup-list">
                                            {visiblePartTasks.map(({ part, mindmap }) => {
                                                const hasContent = !!mindmap?.imageUrl || !!mindmap?.tldrawSnapshot;
                                                const isComplete = mindmap?.isComplete && hasContent;
                                                return (
                                                    <div key={part} className="mobile-subgroup-item" style={{ flexDirection: 'column', alignItems: 'flex-start', paddingLeft: '1rem', background: 'var(--background)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '0.5rem' }}>
                                                            <div className="node-target" style={{ fontSize: '0.9rem' }}>Part {part}</div>
                                                            <span className={`status-badge ${isComplete ? 'learned' : 'partial'}`}>
                                                                {isComplete ? 'Complete' : 'Incomplete'}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => setActivePartEditor({ partId: part, snapshot: mindmap?.tldrawSnapshot })}
                                                                style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}
                                                            >
                                                                <PenTool size={14} style={{ marginRight: '4px' }} />
                                                                {mindmap?.tldrawSnapshot ? 'Edit' : 'Create'}
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => handleImportPremade('part', part)}
                                                                style={{ padding: '0.4rem', fontSize: '0.75rem' }}
                                                                title="Import Premade"
                                                            >
                                                                <Download size={14} />
                                                            </button>
                                                            {hasContent && (
                                                                <Link
                                                                    href={`/docs/mindmaps/part-${part}`}
                                                                    className="btn btn-secondary"
                                                                    style={{ padding: '0.4rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}
                                                                >
                                                                    <Info size={14} />
                                                                </Link>
                                                            )}
                                                            <button
                                                                className={`btn ${!hasContent ? 'btn-secondary' : 'btn-success'}`}
                                                                disabled={!hasContent}
                                                                onClick={() => handlePartComplete(part)}
                                                                style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}
                                                            >
                                                                <Check size={14} /> {mindmap?.isComplete ? 'Done' : 'Complete'}
                                                            </button>
                                                            {/* Issue #5: Delete button for mobile Part Mindmaps */}
                                                            {hasContent && (
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    onClick={() => {
                                                                        if (confirm('Delete this part mindmap?')) {
                                                                            const newMaps = { ...partMindmaps };
                                                                            delete newMaps[part];
                                                                            setPartMindmaps(newMaps);
                                                                            savePartMindMap({ partId: part, imageUrl: null, imageUrlDark: null, description: '', isComplete: false, tldrawSnapshot: undefined, deletedAt: new Date().toISOString() });
                                                                            // syncWithCloud().catch(console.error);
                                                                        }
                                                                    }}
                                                                    style={{ padding: '0.4rem', fontSize: '0.75rem', color: 'var(--danger)' }}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Surah Mindmaps Mobile Group */}
                                <div className="mobile-group-item">
                                    <div className="mobile-group-header" onClick={() => toggleSubgroup('surah')}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <MapPinned size={16} />
                                            <span style={{ fontWeight: 600 }}>Surah Mindmaps</span>
                                            <span className="status-badge" style={{ fontSize: '0.65rem', color: 'var(--warning)', opacity: 0.8, marginLeft: '0.5rem' }}>
                                                {surahTasks.length} surahs
                                            </span>
                                        </div>
                                        {collapsedSubgroups['surah'] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                    {!collapsedSubgroups['surah'] && (
                                        <div className="mobile-subgroup-list">
                                            {surahTasks.length === 0 ? (
                                                <div className="empty-state" style={{ padding: '1rem', fontSize: '0.85rem' }}>No surahs in this part!</div>
                                            ) : (
                                                surahTasks.map(({ surah, mindmap }) => {
                                                    const isExpanded = expandedSurahs[surah.id] || false;
                                                    const hasContent = !!mindmap?.imageUrl || !!mindmap?.tldrawSnapshot;
                                                    const isComplete = mindmap?.isComplete && hasContent;
                                                    return (
                                                        <div key={surah.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <div
                                                                className="mobile-subgroup-item"
                                                                onClick={() => toggleSurahExpand(surah.id)}
                                                                style={{ paddingLeft: '1rem', background: 'var(--background-secondary)', justifyContent: 'space-between', borderTop: 'none' }}
                                                            >
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <div className="surah-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.7rem' }}>{surah.id}</div>
                                                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{surah.name}</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                                            <span className={`status-badge ${mindmap?.isComplete ? 'learned' : 'partial'}`} style={{ fontSize: '0.65rem' }}>
                                                                                {mindmap?.isComplete ? 'Complete' : 'Incomplete'}
                                                                            </span>
                                                                        </div>
                                                                        <ChevronDown size={16} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5 }} />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {isExpanded && (
                                                                <div style={{ background: 'var(--background)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                                    {mindmap && (mindmap.imageUrl || mindmap.imageUrlDark) && (
                                                                        <div style={{ position: 'relative', width: '100%', height: '250px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                                            <img src={mindmap.imageUrl ?? undefined} className="light-mode-only" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#f5f5f5' }} />
                                                                            <img src={mindmap.imageUrlDark ?? mindmap.imageUrl ?? undefined} className="dark-mode-only" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#1e1e1e', filter: !mindmap.imageUrlDark && mindmap.imageUrl ? 'invert(0.9) hue-rotate(180deg)' : 'none' }} />
                                                                        </div>
                                                                    )}
                                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                        <button
                                                                            className="upload-tile"
                                                                            style={{ padding: '0.5rem', height: 'auto', margin: 0, flex: 1, justifyContent: 'center', border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer' }}
                                                                            onClick={() => setActiveMindmapEditor({ surahId: surah.id, snapshot: mindmap?.tldrawSnapshot })}
                                                                        >
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <PenTool size={16} />
                                                                                <span style={{ fontSize: '0.75rem' }}>{mindmap?.tldrawSnapshot ? 'Edit Map' : 'Start Map'}</span>
                                                                            </div>
                                                                        </button>
                                                                        <button
                                                                            className="btn btn-secondary"
                                                                            style={{ padding: '0.5rem', height: 'auto', margin: 0, justifyContent: 'center' }}
                                                                            onClick={() => handleImportPremade('surah', surah.id)}
                                                                            title="Import Premade"
                                                                        >
                                                                            <Download size={16} />
                                                                        </button>
                                                                        {hasContent && (
                                                                            <Link
                                                                                href={`/docs/mindmaps/surah-${surah.id}`}
                                                                                className="btn btn-secondary"
                                                                                style={{ padding: '0.5rem', height: 'auto', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                            >
                                                                                <Info size={16} />
                                                                            </Link>
                                                                        )}
                                                                        <button
                                                                            className={`btn ${(!mindmap?.imageUrl && !mindmap?.tldrawSnapshot) ? 'btn-secondary' : 'btn-success'}`}
                                                                            disabled={!mindmap?.imageUrl && !mindmap?.tldrawSnapshot}
                                                                            onClick={() => handleMarkComplete(surah.id, mindmap)}
                                                                            style={{ flex: 1, fontSize: '0.75rem', padding: '0.5rem' }}
                                                                        >
                                                                            <Check size={16} /> {mindmap?.isComplete ? 'Done' : 'Complete'}
                                                                        </button>
                                                                        {/* Issue #4: Delete button for mobile Surah Mindmaps */}
                                                                        {(mindmap?.imageUrl || mindmap?.tldrawSnapshot) && (
                                                                            <button
                                                                                className="btn btn-secondary"
                                                                                onClick={() => {
                                                                                    if (confirm('Delete this mindmap?')) {
                                                                                        const newMaps = { ...mindmaps };
                                                                                        delete newMaps[surah.id];
                                                                                        setMindmaps(newMaps);
                                                                                        saveMindMap({ ...mindmap, imageUrl: null, imageUrlDark: null, tldrawSnapshot: undefined, isComplete: false, deletedAt: new Date().toISOString() });
                                                                                        // syncWithCloud().catch(console.error);
                                                                                    }
                                                                                }}
                                                                                style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--danger)' }}
                                                                            >
                                                                                <Trash2 size={14} />
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {/* Complex Anchor Builder Trigger */}
                                                                    {(mindmap?.imageUrl || mindmap?.tldrawSnapshot) && (
                                                                        <button
                                                                            className="btn btn-secondary"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setActiveSlideOver({ type: 'surah', title: 'Surah Mindmaps', data: { surahId: surah.id } });
                                                                            }}
                                                                            style={{ width: '100%', padding: '0.5rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                                                                        >
                                                                            <Settings2 size={16} /> Manage Anchors (Advanced)
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {
                isAllDone && (
                    <div className="card modern-card" style={{ padding: '2rem', textAlign: 'center', background: 'var(--success-bg)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                        <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                            <Check size={48} style={{ color: 'var(--success)' }} />
                            <div>
                                <h2 style={{ color: 'var(--success)', marginBottom: '0.25rem' }}>All Clear!</h2>
                                <p style={{ color: 'var(--foreground-secondary)' }}>You have completed all pending tasks for this part.</p>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Mobile Slide-Over */}
            {
                activeSlideOver && (
                    <div className="slide-over-overlay" onClick={() => setActiveSlideOver(null)}>
                        <div className="slide-over-content" onClick={e => e.stopPropagation()}>
                            <div className="slide-over-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                        {activeSlideOver.type === 'suspended' ? <AlertTriangle size={18} /> :
                                            activeSlideOver.type === 'similar' ? <Brain size={18} /> :
                                                activeSlideOver.type === 'part' ? <Map size={18} /> :
                                                    <MapPinned size={18} />}
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{activeSlideOver.title}</h3>
                                </div>
                                <button className="close-btn" onClick={() => setActiveSlideOver(null)}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="slide-over-body">
                                {activeSlideOver.type === 'suspended' && (
                                    <div className="mobile-node-list">
                                        {suspendedAnchors.length === 0 ? (
                                            <div className="empty-state">No suspended anchors!</div>
                                        ) : (
                                            suspendedAnchors.map(issue => {
                                                const key = `${issue.surahId}-${issue.anchorId}`;
                                                const surah = getSurah(issue.surahId);
                                                return (
                                                    <div key={key} className="mobile-node-card">
                                                        <div className="node-card-main">
                                                            <div className="node-target">
                                                                {surah?.name} - {issue.label}
                                                            </div>
                                                            <span className="status-badge not-remembered" style={{ background: 'var(--danger)', color: 'white' }}>Suspended</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => setActiveMindmapEditor({ surahId: issue.surahId, snapshot: mindmaps[issue.surahId]?.tldrawSnapshot })}
                                                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', flex: 1 }}
                                                            >
                                                                <PenTool size={14} style={{ marginRight: '4px' }} />
                                                                Edit Map
                                                            </button>
                                                            <button
                                                                className="btn btn-primary"
                                                                style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}
                                                                onClick={() => handleFixConfirm(issue.surahId, issue.anchorId)}
                                                            >
                                                                <Check size={14} style={{ marginRight: '4px' }} /> Confirm Fix
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {activeSlideOver.type === 'similar' && (
                                    <div className="mobile-node-list">
                                        {groupedSimilarity.length === 0 ? (
                                            <div className="empty-state">No similarity checks needed.</div>
                                        ) : (
                                            groupedSimilarity.map(({ surah, items, count }) => (
                                                <div key={surah!.id} className="mobile-node-card">
                                                    <div className="node-card-main" onClick={() => toggleSurahExpand(surah!.id)} style={{ marginBottom: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <div className="surah-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' }}>{surah!.id}</div>
                                                            <div className="node-target">{surah?.name}</div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span className="status-badge partial">{count} items</span>
                                                            <ChevronDown size={16} style={{ transform: expandedSurahs[surah!.id] ? 'rotate(180deg)' : 'none' }} />
                                                        </div>
                                                    </div>

                                                    {expandedSurahs[surah!.id] && (
                                                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                            {items.map(({ err, muts }) => {
                                                                const abs = err.absoluteAyah!;
                                                                const ref = absoluteToSurahAyah(abs);
                                                                return muts.map((entry: any) => {
                                                                    const decisionKey = `${abs}-${entry.phraseId}`;
                                                                    const existing = decisions[decisionKey] || { status: 'pending', note: '' };
                                                                    const isConfirmed = !!existing.confirmedAt;
                                                                    const matches = entry.matches.filter((m: any) => m !== abs);

                                                                    return (
                                                                        <div key={decisionKey} style={{ padding: '0.75rem', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Ayah {ref.ayahId}</span>
                                                                                {isConfirmed && <span style={{ color: 'var(--success)', fontSize: '0.7rem' }}>✓ Confirmed</span>}
                                                                            </div>

                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                                                <select
                                                                                    value={existing.status}
                                                                                    onChange={e => handleSimilarityDecision(abs, e.target.value as any, entry.phraseId, false)}
                                                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', fontSize: '0.8rem', border: '1px solid var(--border)' }}
                                                                                >
                                                                                    {MUT_STATES.map(s => (
                                                                                        <option key={s.value} value={s.value}>{s.label}</option>
                                                                                    ))}
                                                                                </select>
                                                                                <button
                                                                                    className={`btn ${isConfirmed ? 'btn-secondary' : 'btn-primary'}`}
                                                                                    onClick={() => handleSimilarityDecision(abs, existing.status, entry.phraseId, true)}
                                                                                    style={{ padding: '0.4rem', fontSize: '0.8rem', width: '100%' }}
                                                                                >
                                                                                    {isConfirmed ? 'Update' : 'Confirm'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                });
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {activeSlideOver.type === 'part' && (
                                    <div className="mobile-node-list">
                                        {visiblePartTasks.map(({ part, mindmap }) => {
                                            const hasContent = !!mindmap?.imageUrl || !!mindmap?.tldrawSnapshot;
                                            const isComplete = mindmap?.isComplete && hasContent;
                                            return (
                                                <div key={part} className="mobile-node-card">
                                                    <div className="node-card-main">
                                                        <div className="node-target">Part {part}</div>
                                                        <span className={`status-badge ${isComplete ? 'learned' : 'partial'}`}>
                                                            {isComplete ? 'Complete' : 'Incomplete'}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <label className="upload-tile" style={{ padding: '0.5rem', height: 'auto', margin: 0, justifyContent: 'center', flex: 1 }}>
                                                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePartMindmapUpdate(part, e.target.files?.[0] || null)} />
                                                            <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <ImageIcon size={16} /> {mindmap?.imageUrl ? 'Replace' : 'Upload'}
                                                            </span>
                                                        </label>
                                                        <button
                                                            className={`btn ${!mindmap?.imageUrl ? 'btn-secondary' : 'btn-success'}`}
                                                            disabled={!mindmap?.imageUrl}
                                                            onClick={() => handlePartComplete(part)}
                                                            style={{ padding: '0.5rem', fontSize: '0.8rem', flex: 1 }}
                                                        >
                                                            <Check size={16} /> {mindmap?.isComplete ? 'Done' : 'Complete'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {activeSlideOver.type === 'surah' && (
                                    <div className="mobile-node-list">
                                        {(() => {
                                            const targetId = activeSlideOver.data?.surahId;
                                            const itemsToShow = targetId
                                                ? surahTasks.filter(t => t.surah.id === targetId)
                                                : incompleteSurahMaps;

                                            if (itemsToShow.length === 0) return <div className="empty-state">No surah mindmaps found.</div>;

                                            return itemsToShow.map(({ surah, mindmap }) => {
                                                const isExpanded = expandedSurahs[surah.id] || targetId === surah.id; // Auto-expand if targeted
                                                return (
                                                    <div key={surah.id} className="mobile-node-card">
                                                        <div className="node-card-main" onClick={() => toggleSurahExpand(surah.id)}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <div className="surah-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' }}>{surah.id}</div>
                                                                <div className="node-target">{surah.name}</div>
                                                            </div>
                                                            <ChevronDown size={16} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
                                                        </div>

                                                        {isExpanded && (
                                                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>


                                                                {mindmap?.imageUrl && (
                                                                    <div style={{ marginTop: '0.5rem' }}>
                                                                        <MobileAnchorBuilder
                                                                            surahId={surah.id}
                                                                            verseCount={surah.verseCount}
                                                                            builderState={getBuilderState(surah.id)}
                                                                            mindmapImageUrl={mindmap.imageUrl}
                                                                            onAddBreak={(val) => handleAddBreak(surah.id, val)}
                                                                            onRemoveBreak={(val) => handleRemoveBreakValue(surah.id, val)}
                                                                            onSave={() => handleSaveAnchors(surah.id, surah.verseCount)}
                                                                            hasReviewedHistory={hasReviewedChunks(surah.id)}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

        </div >
    );
}
