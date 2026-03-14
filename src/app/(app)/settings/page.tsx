'use client';

import React, { useEffect, useMemo, useState, useContext, useRef, useCallback, startTransition } from 'react';
import { id } from '@instantdb/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { OnlineStatusContext } from '@/components/Providers';
import { getSurahsByPart, getSurah, getQuranVerses, SURAHS } from '@/lib/quranData';
import {
    ACTIVE_PART_OPTIONS,
    ALL_QURAN_PART,
    AppSettings,
    LEGACY_ALL_QURAN_PART,
    QuranPart,
    MemoryNode,
    getNodeStability,
    getNodeDifficulty,
    getNodeReps,
    getNodeDueDate
} from '@/lib/types';
import { db } from '@/lib/instant';
import { useInstantSettings, useInstantNodes, useInstantMutashabihat, useInstantListeningProgress, useInstantMindMaps } from '@/hooks/useInstantData';
import { createNewFSRSState } from '@/lib/fsrs';
import {
    Check, Clock, PauseCircle, RotateCcw, Download,
    Upload,
    Database,
    CreditCard,
    Brain,
    Plus,
    Trash2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    PenTool,
    SplitSquareHorizontal,
    Map as MapIcon,
    Book,
    Activity,
    X,
    Sun,
    Moon,
    Monitor,
    Palette,
    Sliders
} from 'lucide-react';
import { AccentTheme, Theme, useTheme } from '@/components/ThemeProvider';
import ConfirmationModal from '@/components/todo/ConfirmationModal';
import { AnchorBuilderState } from '@/components/todo/AnchorBuilders';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { useMindmapBackGestureGuard } from '@/hooks/useMindmapBackGestureGuard';
import { getAllMutashabihatRefs, absoluteToSurahAyah, getMutashabihatForAbsolute, surahAyahToAbsolute } from '@/lib/mutashabihat';
import { paddlePriceIds } from '@/lib/paddle/prices';
import { getEffectiveSurahAnchors } from '@/lib/surahSplits';
import { normalizeReviewSortOrder, ReviewSortOrder } from '@/lib/reviewSortOrder';

const AddCustomMutashabihModal = dynamic(() => import('@/components/AddCustomMutashabihModal'), { ssr: false });
const MutashabihNoteModal = dynamic(() => import('@/components/MutashabihNoteModal'), { ssr: false });
const DailyCompletionSlider = dynamic(() => import('@/components/DailyCompletionSlider'), { ssr: false });
const MindmapEditor = dynamic(() => import('@/components/MindmapEditor'), { ssr: false });
const SplitsModal = dynamic(() => import('@/components/todo/SplitsModal'), { ssr: false });
const GoogleOAuthProvider = dynamic(() => import('@react-oauth/google').then((mod) => mod.GoogleOAuthProvider), { ssr: false });
const GoogleLogin = dynamic(() => import('@react-oauth/google').then((mod) => mod.GoogleLogin), { ssr: false });

interface MutashabihatDecision {
    id: string; // absoluteAyah or absoluteAyah-phraseId
    status: 'confirmed' | 'ignored' | 'pending' | 'solved_mindmap' | 'solved_note';
    confirmedAt?: string;
    notes?: string;
}

interface SettingsToastItem {
    id: string;
    type: 'success' | 'error';
    message: string;
    info?: string;
}

type BillingSummaryState = {
    nextRenewalAt: string | null;
    canManageSubscription: boolean;
};

type AccountDeletionStatusState = {
    pending: boolean;
    canCancel: boolean;
    requestedAt: string | null;
    expiresAt: string | null;
    daysUntilAccessEnds: number | null;
};

const DEFAULT_ACCOUNT_DELETION_STATUS: AccountDeletionStatusState = {
    pending: false,
    canCancel: false,
    requestedAt: null,
    expiresAt: null,
    daysUntilAccessEnds: null,
};

const isMobileViewport = () =>
    typeof window !== 'undefined' && window.innerWidth < 768;

const getInitialSectionExpansion = () => {
    const expanded = !isMobileViewport();
    return {
        cloudSync: expanded,
        backupRestore: expanded,
        schedule: expanded,
        activePart: expanded,
        surahStatus: expanded,
        mutashabihat: expanded,
        advancedOptions: expanded,
    };
};

const THEME_MODE_OPTIONS: Array<{ id: Theme; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
];

const ACCENT_THEME_OPTIONS: Array<{ id: AccentTheme; label: string; accent: string }> = [
    { id: 'default', label: 'Default', accent: '#5b8fb9' },
    { id: 'dracula', label: 'Dracula', accent: '#bd93f9' },
    { id: 'nord', label: 'Nord', accent: '#88c0d0' },
    { id: 'catppuccin', label: 'Catppuccin', accent: '#d6a8ca' },
    { id: 'solarized', label: 'Solarized', accent: '#2aa198' },
    { id: 'tokyo-night', label: 'Tokyo Night', accent: '#7aa2f7' },
];

function AppearanceCard({
    onSelectTheme,
    onSelectAccentTheme,
}: {
    onSelectTheme: (nextTheme: Theme) => void;
    onSelectAccentTheme: (nextTheme: AccentTheme) => void;
}) {
    const { theme, accentTheme } = useTheme();

    return (
        <div className="card modern-card" style={{
            background: 'var(--background-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '16px'
        }}>
            <div className="section-title"
                style={{
                    color: 'var(--accent)',
                    fontWeight: 700,
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    fontSize: 'clamp(1rem, 5vw, 1.1rem)'
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="header-icon-badge">
                        <Palette size={18} />
                    </div>
                    <span>Appearance</span>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    Choose how Quran Life looks for you.
                </p>
                <div style={{ display: 'flex', gap: '0.65rem' }}>
                    {THEME_MODE_OPTIONS.map((mode) => (
                        <button
                            key={mode.id}
                            className="appearance-choice-btn"
                            onClick={() => onSelectTheme(mode.id)}
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 0.5rem',
                                borderRadius: '12px',
                                border: theme === mode.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                                background: theme === mode.id ? 'var(--verse-bg)' : 'var(--background)',
                                color: theme === mode.id ? 'var(--accent)' : 'var(--foreground-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: theme === mode.id ? '0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent)' : 'none',
                            }}
                        >
                            <mode.icon size={20} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{mode.label}</span>
                        </button>
                    ))}
                </div>
                <div style={{ marginTop: '0.65rem' }}>
                    <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.8rem', marginBottom: '0.6rem' }}>
                        Accent theme
                    </p>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                            gap: '0.5rem',
                        }}
                    >
                        {ACCENT_THEME_OPTIONS.map((option) => {
                            const isActive = accentTheme === option.id;
                            return (
                                <button
                                    key={option.id}
                                    className="appearance-choice-btn"
                                    onClick={() => onSelectAccentTheme(option.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.55rem 0.65rem',
                                        borderRadius: '10px',
                                        border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                                        background: isActive ? 'var(--verse-bg)' : 'var(--background)',
                                        color: isActive ? 'var(--accent)' : 'var(--foreground-secondary)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        fontSize: '0.76rem',
                                        fontWeight: isActive ? 600 : 500,
                                        minHeight: '40px',
                                    }}
                                >
                                    <span
                                        aria-hidden
                                        style={{
                                            width: '12px',
                                            height: '12px',
                                            borderRadius: '999px',
                                            background: option.accent,
                                            border: '1px solid color-mix(in srgb, var(--foreground) 16%, transparent)',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

const MUT_STATES: { value: MutashabihatDecision['status']; label: string }[] = [
    { value: 'pending', label: 'Pending Review' },
    { value: 'ignored', label: 'Ignored (Not similar)' },
    { value: 'solved_mindmap', label: 'Solved by Mindmap' },
    { value: 'solved_note', label: 'Solved by Note' },
];
const MUTASHABIH_NOTE_MAX_LENGTH = 300;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due', 'trialing']);
const LOCKED_SKIPPED_SURAH_ID = 1;
const SETTINGS_WRITE_DEBOUNCE_MS = 300;
const MATURITY_UPDATE_BATCH_SIZE = 20;
const DELETE_REASON_DETAIL_MAX_LENGTH = 500;
const DELETE_CHURN_REASONS = [
    { id: 'price_too_high', label: 'Price is too high' },
    { id: 'not_using_enough', label: 'Not using enough' },
    { id: 'missing_features', label: 'Missing features' },
    { id: 'technical_issues', label: 'Technical issues' },
    { id: 'switching_tool', label: 'Switching to another tool' },
    { id: 'temporary_break', label: 'Taking a temporary break' },
    { id: 'other', label: 'Other reason' },
] as const;
type DeleteChurnReasonCode = (typeof DELETE_CHURN_REASONS)[number]['id'];

type SimilarityResolutionTarget = {
    phraseId: string;
    decisionKey: string;
    representativeAbs: number;
};

type SimilaritySurahGroup = {
    phraseId: string;
    phraseIds: string[];
    ayahIds: number[];
    absRefs: number[];
    entries: any[];
    customIds: string[];
    matchCount: number;
    decisionKey: string;
    representativeAbs: number;
    resolutionTargets: SimilarityResolutionTarget[];
};

const formatKnowledgeTrackingDueDate = (due: string | null): string => {
    if (!due) return '-';
    const parsed = new Date(due);
    if (Number.isNaN(parsed.getTime())) return due;
    const year = parsed.getFullYear().toString().padStart(4, '0');
    const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
    const day = parsed.getDate().toString().padStart(2, '0');
    const hours = parsed.getHours().toString().padStart(2, '0');
    const minutes = parsed.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const formatKnowledgeTrackingInterval = (stabilityDays: number): string => {
    if (!Number.isFinite(stabilityDays) || stabilityDays <= 0) return '-';

    const round1 = (value: number) => Math.round(value * 10) / 10;
    const formatValue = (value: number) => {
        const rounded = round1(value);
        return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
    };

    if (stabilityDays >= 365) return `${formatValue(stabilityDays / 365)}y`;
    if (stabilityDays >= 30) return `${formatValue(stabilityDays / 30)}mo`;
    if (stabilityDays >= 7) return `${formatValue(stabilityDays / 7)}w`;
    if (stabilityDays >= 1) return `${formatValue(stabilityDays)}d`;
    return `${Math.max(1, Math.round(stabilityDays * 24))}h`;
};

const formatKnowledgeTrackingDifficulty = (difficulty: number): string => {
    if (!Number.isFinite(difficulty) || difficulty <= 0) return '-';

    // Display-only major scale (1-5) while keeping internal FSRS 1-10 unchanged.
    const clampedFsrs = Math.min(10, Math.max(1, difficulty));
    const majorDifficulty = 1 + ((clampedFsrs - 1) / 9) * 4;
    const rounded = Math.round(majorDifficulty * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}/5` : `${rounded.toFixed(1)}/5`;
};

const toPositiveInt = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toNonNegativeInt = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const formatBillingDate = (value: string | null | undefined): string => {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
};

const getDaysUntilIso = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const parsedMs = Date.parse(value);
    if (!Number.isFinite(parsedMs)) return null;
    const remainingMs = parsedMs - Date.now();
    if (remainingMs <= 0) return 0;
    return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
};

const formatDaysLabel = (days: number | null): string | null => {
    if (days === null) return null;
    return `${days} day${days === 1 ? '' : 's'}`;
};

const normalizeAccountDeletionStatus = (payload: unknown): AccountDeletionStatusState => {
    const raw = payload as Record<string, unknown> | null | undefined;
    const daysRaw = Number(raw?.daysUntilAccessEnds);
    return {
        pending: Boolean(raw?.pending),
        canCancel: Boolean(raw?.canCancel),
        requestedAt: typeof raw?.requestedAt === 'string' && raw.requestedAt ? raw.requestedAt : null,
        expiresAt: typeof raw?.expiresAt === 'string' && raw.expiresAt ? raw.expiresAt : null,
        daysUntilAccessEnds: Number.isFinite(daysRaw) && daysRaw >= 0 ? daysRaw : null,
    };
};

const resolveNodeSurahId = (node: Partial<MemoryNode>): number | null => {
    const direct = toPositiveInt((node as any).surahId);
    if (direct) return direct;
    const target = String((node as any).targetId || '');
    const anchorMatch = target.match(/^anchor-(\d+)-\d+-\d+$/);
    if (anchorMatch) return toPositiveInt(anchorMatch[1]);
    const mindmapMatch = target.match(/^mindmap-(\d+)$/);
    if (mindmapMatch) return toPositiveInt(mindmapMatch[1]);
    return null;
};

const resolveNodePartId = (node: Partial<MemoryNode>): number | null => {
    const direct = toNonNegativeInt((node as any).partId);
    if (direct !== null) return direct;
    const target = String((node as any).targetId || '');
    const partMatch = target.match(/^part-mindmap-(\d+)$/);
    if (!partMatch) return null;
    return toNonNegativeInt(partMatch[1]);
};

const stableNodeId = (...parts: Array<string | number>) =>
    parts.map((part) => String(part).trim().replace(/[^a-zA-Z0-9_-]/g, '_')).join('__');

/**
 * Renders Arabic text with highlighted word ranges
 */
/**
 * Renders Arabic text with highlighted word ranges.
 * Note: Highlighting indices come from the Mutashabihat ul Quran dataset.
 * Some minor offsets (1-2 words) may occur due to variations in whitespace
 * or tokenization between datasets.
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

export default function SettingsPage() {
    const router = useRouter();
    const isOnline = useContext(OnlineStatusContext);
    const { user } = db.useAuth();
    const { data: subscriptionData } = db.useQuery({
        subscriptions: {
            $: {
                where: { userId: user?.id || '' },
            },
        },
    });
    const subscriptions = useMemo(() => subscriptionData?.subscriptions ?? [], [subscriptionData?.subscriptions]);
    const { settings, saveSettings } = useInstantSettings();
    const { nodes: instantNodes, saveNode: saveInstantNode } = useInstantNodes();
    const { mindmaps: instantMindmaps, saveMindMap } = useInstantMindMaps();
    const { progress: listeningProgress } = useInstantListeningProgress();
    const { decisions: instantDecisions, custom: instantCustomMutashabihat, saveDecision: updateInstantDecision, saveCustom: updateInstantCustom } = useInstantMutashabihat();
    const { theme, setTheme, accentTheme, setAccentTheme } = useTheme();
    const [systemIsDark, setSystemIsDark] = useState(false);
    const { confirm, alert } = useConfirmDialog();

    const todoFilterOptions = [
        { id: 'all', label: 'All Items' },
        { id: 'maintenance', label: 'Review Fixes' },
        { id: 'construction', label: 'Study Progress' }
    ] as const;
    const reviewSortOptions = [
        { id: 'surah_grouped', label: 'Grouped by Surah' },
        { id: 'due_date', label: 'Due Date (Soonest First)' },
        { id: 'type_grouped', label: 'By Type (Part → Surah → Verse)' }
    ] as const;
    const completeExitOptions = [
        { id: 'mindmap_only', label: 'Suspend Mindmap Only' },
        { id: 'mindmap_and_verses', label: 'Suspend Mindmap + Verses' }
    ] as const;
    const kanbanSortOptions = [
        { id: 'type_then_number', label: 'Type then Number (Default)' },
        { id: 'number_only', label: 'Number Only' },
        { id: 'manual', label: 'Manual (Drag to Sort)' }
    ] as const;
    const dailyPortionModeOptions = [
        { id: 'audio', label: 'Listening' },
        { id: 'reading', label: 'Reading' }
    ] as const;
    const dailyReadingStyleOptions = [
        { id: 'line_by_line', label: 'Line by Line Quran' },
        { id: 'paragraph', label: 'Paragraph Style' }
    ] as const;
    const todayDefaultModeOptions = [
        { id: 'daily', label: 'Daily Portion' },
        { id: 'review', label: 'Reviews' }
    ] as const;

    const [decisions, setDecisions] = useState<Record<string, MutashabihatDecision>>({});
    const [expandedSurahs, setExpandedSurahs] = useState<Record<number, boolean>>({});
    const [expandedMutItems, setExpandedMutItems] = useState<Record<string, boolean>>({});
    const [selectedMutSurah, setSelectedMutSurah] = useState<number | null>(null);
    const [verses, setVerses] = useState<{ surahId: number; ayahId: number; text: string }[]>([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [noteModal, setNoteModal] = useState<{
        decisionKey: string;
        representativeAbs: number;
        resolutionTargets?: SimilarityResolutionTarget[];
        title: string;
        initialNote: string;
    } | null>(null);
    const [targetSurahId, setTargetSurahId] = useState<number | undefined>();
    const [showDebugNodes, setShowDebugNodes] = useState(() => !isMobileViewport());
    const [memoryNodes, setMemoryNodes] = useState<MemoryNode[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [isMobile, setIsMobile] = useState(isMobileViewport);
    const [knowledgeFilter, setKnowledgeFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming' | 'not_due'>('all');
    const [activeSlideOverGroup, setActiveSlideOverGroup] = useState<{
        id: string;
        title: string;
        type: 'verse_segment' | 'mindmap' | 'part_mindmap';
        nodes: MemoryNode[];
        surahId?: number;
    } | null>(null);
    const [todoDefaultFilter, setTodoDefaultFilter] = useState<'all' | 'maintenance' | 'construction'>(settings.todoDefaultFilter ?? 'all');
    const [reviewSortOrder, setReviewSortOrder] = useState<ReviewSortOrder>(normalizeReviewSortOrder(settings.reviewSortOrder));
    const [completeExitBehavior, setCompleteExitBehavior] = useState<'mindmap_only' | 'mindmap_and_verses'>(settings.completeExitBehavior ?? 'mindmap_only');
    const [kanbanSortOrder, setKanbanSortOrder] = useState<'type_then_number' | 'number_only' | 'manual'>(settings.kanbanSortOrder ?? 'type_then_number');
    const [dailyPortionMode, setDailyPortionMode] = useState<'audio' | 'reading'>(settings.dailyPortionMode ?? 'audio');
    const [dailyReadingStyle, setDailyReadingStyle] = useState<'line_by_line' | 'paragraph'>(settings.dailyReadingStyle ?? 'line_by_line');
    const [todayDefaultMode, setTodayDefaultMode] = useState<'daily' | 'review'>(settings.todayDefaultMode ?? 'daily');
    const [completionDaysDraft, setCompletionDaysDraft] = useState<number>(settings.completionDays || 30);
    const completionDaysSaveTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const sync = (event?: MediaQueryListEvent) => {
            setSystemIsDark(event ? event.matches : media.matches);
        };
        sync();
        if (media.addEventListener) {
            media.addEventListener('change', sync);
            return () => media.removeEventListener('change', sync);
        }
        media.addListener(sync);
        return () => media.removeListener(sync);
    }, []);
    const isDark = theme === 'system' ? systemIsDark : theme === 'dark';
    const activePartLabel = settings.activePart === ALL_QURAN_PART ? 'All Quran' : `Part ${settings.activePart}`;

    const [activeMutSlideOver, setActiveMutSlideOver] = useState<{
        id: string;
        title: string;
        surahId: number;
        phraseId: string;
        group: SimilaritySurahGroup;
        representativeAbs: number;
    } | null>(null);
    const [settingsContextVerseCursor, setSettingsContextVerseCursor] = useState<Record<number, number>>({});
    const [settingsMindmapEditor, setSettingsMindmapEditor] = useState<{ surahId: number; snapshot?: any } | null>(null);
    const [settingsSplitsSurahId, setSettingsSplitsSurahId] = useState<number | null>(null);
    const [settingsAnchorBuilders, setSettingsAnchorBuilders] = useState<Record<number, AnchorBuilderState>>({});
    useMindmapBackGestureGuard(Boolean(settingsMindmapEditor));
    const hasLoadedVersesRef = useRef(false);

    const [activeMobilePage, setActiveMobilePage] = useState<'account' | 'plan' | 'tracking' | 'advanced' | null>(null);
    const [billingSummary, setBillingSummary] = useState<BillingSummaryState>({
        nextRenewalAt: null,
        canManageSubscription: false,
    });
    const verseByRefKey = useMemo(() => {
        const map = new Map<string, { surahId: number; ayahId: number; text: string }>();
        for (const verse of verses) {
            map.set(`${verse.surahId}:${verse.ayahId}`, verse);
        }
        return map;
    }, [verses]);
    const getVerseByRef = useCallback((surahId: number, ayahId: number) => {
        return verseByRefKey.get(`${surahId}:${ayahId}`);
    }, [verseByRefKey]);
    const [accountDeletionStatus, setAccountDeletionStatus] = useState<AccountDeletionStatusState>(DEFAULT_ACCOUNT_DELETION_STATUS);
    const [isOpeningPortal, setIsOpeningPortal] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [isCancellingDeletion, setIsCancellingDeletion] = useState(false);
    const [isDeleteFeedbackModalOpen, setIsDeleteFeedbackModalOpen] = useState(false);
    const [deleteReasonCode, setDeleteReasonCode] = useState<DeleteChurnReasonCode>('other');
    const [deleteReasonDetail, setDeleteReasonDetail] = useState('');
    const [deleteReasonError, setDeleteReasonError] = useState<string | null>(null);
    const [toasts, setToasts] = useState<SettingsToastItem[]>([]);
    const lastToastRef = useRef<{ key: string; at: number } | null>(null);
    const mobileHistorySyncRef = useRef(false);
    const mobileOverlayHistorySyncRef = useRef(false);
    const mobileHistoryKey = 'mobileSettingsPage';
    const mobileOverlayHistoryKey = 'mobileSettingsOverlayOpen';
    const wasMobileOverlayOpenRef = useRef(false);

    const latestPartMindmaps = useMemo(() => {
        const partMindmapNodes = memoryNodes.filter(n => (n as any).type === 'part_mindmap');
        const latestMap: { [key: number]: MemoryNode } = {};
        partMindmapNodes.forEach(node => {
            const part = resolveNodePartId(node);
            if (part === null) return;
            if (node.createdAt) {
                const existingNode = latestMap[part];
                if (!existingNode || !existingNode.createdAt || new Date(node.createdAt) > new Date(existingNode.createdAt)) {
                    latestMap[part] = node;
                }
            }
        });
        return Object.values(latestMap);
    }, [memoryNodes]);

    const latestSurahMindmaps = useMemo(() => {
        const surahMindmapNodes = memoryNodes.filter(n => (n as any).type === 'mindmap');
        const latestMap: { [key: number]: MemoryNode } = {};
        surahMindmapNodes.forEach(node => {
            const surahId = resolveNodeSurahId(node);
            if (!surahId) return;
            if (node.createdAt) {
                const existingNode = latestMap[surahId];
                if (!existingNode || !existingNode.createdAt || new Date(node.createdAt) > new Date(existingNode.createdAt)) {
                    latestMap[surahId] = node;
                }
            }
        });
        return Object.values(latestMap);
    }, [memoryNodes]);

    const latestVerseSegments = useMemo(() => {
        const verseNodes = memoryNodes.filter(n => n.type === 'verse_segment');
        const latestMap: Record<string, MemoryNode> = {};
        verseNodes.forEach(node => {
            const surahId = resolveNodeSurahId(node);
            if (!surahId) return;
            const key = `${surahId}-${node.startVerse}-${node.endVerse}`;
            const existing = latestMap[key];
            if (!existing) {
                latestMap[key] = node;
                return;
            }
            if (node.createdAt && (!existing.createdAt || new Date(node.createdAt) > new Date(existing.createdAt))) {
                latestMap[key] = node;
            }
        });
        return Object.values(latestMap);
    }, [memoryNodes]);

    const settingsMindmapsBySurah = useMemo(() => {
        const acc: Record<number, any> = {};
        instantMindmaps.forEach((mm: any) => {
            const surahId = Number(mm?.surahId);
            if (!Number.isFinite(surahId) || surahId <= 0) return;
            const existing = acc[surahId];
            if (!existing) {
                acc[surahId] = mm;
                return;
            }
            const existingTs = Date.parse(String(existing?.updatedAt || existing?.createdAt || ''));
            const nextTs = Date.parse(String(mm?.updatedAt || mm?.createdAt || ''));
            if ((Number.isFinite(nextTs) ? nextTs : 0) >= (Number.isFinite(existingTs) ? existingTs : 0)) {
                acc[surahId] = mm;
            }
        });
        return acc;
    }, [instantMindmaps]);

    const getKnowledgeDueKey = (due: string | null): string | null => {
        if (!due) return null;
        const parsed = new Date(due);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
        const match = due.match(/\d{4}-\d{2}-\d{2}/);
        return match ? match[0] : null;
    };

    const todayKey = new Date().toISOString().split('T')[0];

    const matchesKnowledgeFilter = (node: MemoryNode): boolean => {
        if (knowledgeFilter === 'all') return true;
        const dueKey = getKnowledgeDueKey(getNodeDueDate(node));
        if (!dueKey) return knowledgeFilter === 'not_due';
        if (knowledgeFilter === 'not_due') return false;
        if (knowledgeFilter === 'overdue') return dueKey < todayKey;
        if (knowledgeFilter === 'today') return dueKey === todayKey;
        if (knowledgeFilter === 'upcoming') return dueKey > todayKey;
        return true;
    };

    const filteredPartMindmaps = latestPartMindmaps.filter(matchesKnowledgeFilter);
    const filteredSurahMindmaps = latestSurahMindmaps.filter(matchesKnowledgeFilter);
    const filteredVerseSegments = latestVerseSegments.filter(matchesKnowledgeFilter);
    const hasExpandedKnowledgeItems = Object.values(expandedGroups).some(Boolean);
    const hasExpandedSimilarVerseItems = Object.values(expandedSurahs).some(Boolean) || Object.values(expandedMutItems).some(Boolean);

    const foldKnowledgeTrackingItems = () => {
        setExpandedGroups({});
        setActiveSlideOverGroup(null);
    };

    const foldSimilarVerseItems = () => {
        setExpandedSurahs({});
        setExpandedMutItems({});
        setActiveMutSlideOver(null);
    };

    const closeSettingsSlideOvers = useCallback(() => {
        setActiveSlideOverGroup(null);
        setActiveMutSlideOver(null);
        if (!isMobile || typeof window === 'undefined') return;
        const currentState = window.history.state || {};
        if (currentState[mobileOverlayHistoryKey]) {
            window.history.back();
        }
    }, [isMobile, mobileOverlayHistoryKey]);

    const getFilteredNodesForSlideOver = (type: 'verse_segment' | 'mindmap' | 'part_mindmap', surahId?: number) => {
        if (type === 'verse_segment' && surahId) {
            return filteredVerseSegments.filter(n => n.type === 'verse_segment' && resolveNodeSurahId(n) === surahId);
        }
        if (type === 'mindmap') return filteredSurahMindmaps;
        if (type === 'part_mindmap') return filteredPartMindmaps;
        return [];
    };


    // Sync instant decisions to local state for easier lookups
    useEffect(() => {
        const decisionsMap: Record<string, MutashabihatDecision> = {};
        instantDecisions.forEach(d => {
            decisionsMap[d.phraseId] = d as any;
        });
        setDecisions(decisionsMap);
    }, [instantDecisions]);

    // Sync instant nodes to local state
    useEffect(() => {
        setMemoryNodes(instantNodes);
    }, [instantNodes]);

    useEffect(() => {
        const checkMobile = () => setIsMobile(isMobileViewport());
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        if (!isMobile) return;

        const currentState = window.history.state || {};
        if (currentState[mobileHistoryKey] === undefined || currentState[mobileOverlayHistoryKey] === undefined) {
            window.history.replaceState({
                ...currentState,
                [mobileHistoryKey]: currentState[mobileHistoryKey] ?? null,
                [mobileOverlayHistoryKey]: currentState[mobileOverlayHistoryKey] ?? false
            }, '');
        }

        const handlePopState = (event: PopStateEvent) => {
            mobileOverlayHistorySyncRef.current = true;
            mobileHistorySyncRef.current = true;
            const nextPage = event.state?.[mobileHistoryKey] ?? null;
            setActiveMobilePage(nextPage);
            if (activeSlideOverGroup || activeMutSlideOver) {
                setActiveSlideOverGroup(null);
                setActiveMutSlideOver(null);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [activeMutSlideOver, activeSlideOverGroup, isMobile, mobileHistoryKey, mobileOverlayHistoryKey]);

    useEffect(() => {
        if (!isMobile) return;
        if (mobileHistorySyncRef.current) {
            mobileHistorySyncRef.current = false;
            return;
        }

        const currentState = window.history.state || {};
        const currentPage = currentState[mobileHistoryKey] ?? null;
        if (currentPage === activeMobilePage) return;

        if (activeMobilePage === null) {
            window.history.replaceState({ ...currentState, [mobileHistoryKey]: null }, '');
        } else {
            window.history.pushState({ ...currentState, [mobileHistoryKey]: activeMobilePage }, '');
        }
    }, [activeMobilePage, isMobile, mobileHistoryKey]);

    useEffect(() => {
        if (!isMobile) {
            wasMobileOverlayOpenRef.current = false;
            return;
        }
        if (mobileOverlayHistorySyncRef.current) {
            mobileOverlayHistorySyncRef.current = false;
            wasMobileOverlayOpenRef.current = !!(activeSlideOverGroup || activeMutSlideOver);
            return;
        }

        const isOverlayOpen = !!(activeSlideOverGroup || activeMutSlideOver);
        const wasOpen = wasMobileOverlayOpenRef.current;
        wasMobileOverlayOpenRef.current = isOverlayOpen;
        if (isOverlayOpen && !wasOpen) {
            const currentState = window.history.state || {};
            window.history.pushState({
                ...currentState,
                [mobileHistoryKey]: activeMobilePage,
                [mobileOverlayHistoryKey]: true
            }, '');
        }
    }, [activeMobilePage, activeMutSlideOver, activeSlideOverGroup, isMobile, mobileHistoryKey, mobileOverlayHistoryKey]);

    const [sectionsExpanded, setSectionsExpanded] = useState(getInitialSectionExpansion);

    const toggleSection = (key: keyof typeof sectionsExpanded) => {
        // Disable folding on desktop
        if (window.innerWidth < 768) {
            setSectionsExpanded(s => ({ ...s, [key]: !s[key] }));
        }
    };

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setSectionsExpanded({
                    cloudSync: true,
                    backupRestore: true,
                    schedule: true,
                    activePart: true,
                    surahStatus: true,
                    mutashabihat: true,
                    advancedOptions: true,
                });
                setShowDebugNodes(true);
            }
        };

        if (typeof window !== 'undefined') {
            if (window.innerWidth < 768) {
                setSectionsExpanded({
                    cloudSync: false,
                    backupRestore: false,
                    schedule: false,
                    activePart: false,
                    surahStatus: false,
                    mutashabihat: false,
                    advancedOptions: false,
                });
                setShowDebugNodes(false);
            } else {
                setSectionsExpanded({
                    cloudSync: true,
                    backupRestore: true,
                    schedule: true,
                    activePart: true,
                    surahStatus: true,
                    mutashabihat: true,
                    advancedOptions: true,
                });
            }
        }

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // InstantDB Auth State
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
    const [isAuthProcessing, setIsAuthProcessing] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [googleNonce] = useState(() => crypto.randomUUID());

    const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    const GOOGLE_CLIENT_NAME = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_NAME || 'google';

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setIsAuthProcessing(true);

        try {
            if (authStep === 'email') {
                await db.auth.sendMagicCode({ email });
                setAuthStep('code');
            } else {
                await db.auth.signInWithMagicCode({ email, code });
            }
        } catch (err: any) {
            setAuthError(err.body?.message || err.message || 'An error occurred');
        } finally {
            setIsAuthProcessing(false);
        }
    };

    const markSignOutRoutingWindow = useCallback(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem('auth:signingOut', '1');
        window.localStorage.setItem('auth:postSignOutUntil', String(Date.now() + 15000));
    }, []);

    const loadAccountDeletionStatus = useCallback(async () => {
        if (!user?.id) {
            setAccountDeletionStatus(DEFAULT_ACCOUNT_DELETION_STATUS);
            return;
        }
        if (!isOnline) return;

        try {
            const response = await fetch('/api/account/delete-request', {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || 'Could not load account deletion status.');
            }
            setAccountDeletionStatus(normalizeAccountDeletionStatus(payload?.deletion));
        } catch {
            setAccountDeletionStatus(DEFAULT_ACCOUNT_DELETION_STATUS);
        }
    }, [isOnline, user?.id]);

    const handleSignOut = useCallback(async () => {
        const ok = await confirm({
            title: 'Sign Out',
            message: 'Are you sure you want to sign out? You will be redirected to the landing page and will need to sign in again to access the app.',
            confirmLabel: 'Sign Out',
            isDestructive: true,
        });
        if (!ok) return;

        markSignOutRoutingWindow();
        await db.auth.signOut();
        router.replace('/');
    }, [confirm, markSignOutRoutingWindow, router]);

    const handleOpenCustomerPortal = useCallback(async () => {
        if (isOpeningPortal) return;
        setIsOpeningPortal(true);

        try {
            const response = await fetch('/api/paddle/customer-portal', {
                method: 'POST',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok || !payload?.url) {
                throw new Error(payload?.error || 'Could not open billing portal.');
            }

            window.location.assign(payload.url as string);
        } catch (error) {
            await alert({
                title: 'Billing Portal Unavailable',
                message: error instanceof Error ? error.message : 'Could not open billing portal. Please try again.',
            });
        } finally {
            setIsOpeningPortal(false);
        }
    }, [alert, isOpeningPortal]);

    const handleDeleteAccount = useCallback(async () => {
        if (isDeletingAccount || isDeleteFeedbackModalOpen) return;
        const estimatedDaysLeft = getDaysUntilIso(billingSummary.nextRenewalAt);
        const estimatedDaysLabel = formatDaysLabel(estimatedDaysLeft);
        const estimatedEndLabel = billingSummary.nextRenewalAt ? formatBillingDate(billingSummary.nextRenewalAt) : null;
        const timelineNote = estimatedEndLabel
            ? `You will lose app access in ${estimatedDaysLabel ?? '0 days'} (${estimatedEndLabel}) once renewal is stopped.`
            : 'Access will end when your current billing period ends.';
        const ok = await confirm({
            title: 'Request Account Deletion',
            message:
                `This will immediately sign you out, cancel future subscription renewals, and keep your account recoverable until the end of your current billing period. ${timelineNote} You can sign back in and cancel this deletion request before that date. Refunds are available only within our 14-day refund window (see Terms).`,
            confirmLabel: 'Delete & Stop Renewal',
            isDestructive: true,
        });
        if (!ok) return;
        setDeleteReasonError(null);
        setDeleteReasonCode('other');
        setDeleteReasonDetail('');
        setIsDeleteFeedbackModalOpen(true);
    }, [billingSummary.nextRenewalAt, confirm, isDeleteFeedbackModalOpen, isDeletingAccount]);

    const handleSubmitDeleteAccount = useCallback(async () => {
        if (isDeletingAccount) return;

        setDeleteReasonError(null);
        if (!deleteReasonCode) {
            setDeleteReasonError('Please choose one reason.');
            return;
        }

        // Force user to write when selecting "Other" option
        if (deleteReasonCode === 'other' && !deleteReasonDetail.trim()) {
            setDeleteReasonError('Please provide details when selecting "Other".');
            return;
        }

        setIsDeletingAccount(true);
        try {
            const response = await fetch('/api/account/delete-request', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    reasonCode: deleteReasonCode,
                    reasonDetail: deleteReasonDetail.trim().slice(0, DELETE_REASON_DETAIL_MAX_LENGTH),
                }),
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || 'Could not request account deletion.');
            }

            setIsDeleteFeedbackModalOpen(false);
            markSignOutRoutingWindow();
            await db.auth.signOut();
            router.replace('/');
        } catch (error) {
            await alert({
                title: 'Delete Account Failed',
                message: error instanceof Error ? error.message : 'Could not request account deletion. Please try again.',
            });
        } finally {
            setIsDeletingAccount(false);
        }
    }, [alert, deleteReasonCode, deleteReasonDetail, isDeletingAccount, markSignOutRoutingWindow, router]);

    const handleCancelDeletionRequest = useCallback(async () => {
        if (isCancellingDeletion) return;
        const ok = await confirm({
            title: 'Cancel Account Deletion',
            message:
                'This will keep your account active, remove the pending deletion request, and restore subscription auto-renewal if it was canceled by the deletion request. Continue?',
            confirmLabel: 'Keep Account & Renewal',
            isDestructive: false,
        });
        if (!ok) return;

        setIsCancellingDeletion(true);
        try {
            const response = await fetch('/api/account/delete-request', {
                method: 'DELETE',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || 'Could not cancel account deletion.');
            }
            setAccountDeletionStatus(normalizeAccountDeletionStatus(payload?.deletion));
            await alert({
                title: 'Deletion Canceled',
                message: payload?.message || 'Your account deletion request has been canceled and subscription renewal is restored.',
            });
            await loadAccountDeletionStatus();
        } catch (error) {
            await alert({
                title: 'Cancel Deletion Failed',
                message: error instanceof Error ? error.message : 'Could not cancel account deletion. Please try again.',
            });
        } finally {
            setIsCancellingDeletion(false);
        }
    }, [alert, confirm, isCancellingDeletion, loadAccountDeletionStatus]);

    useEffect(() => {
        // Initial load handled by hook
        // setSettings(getSettings());

    }, []);

    useEffect(() => {
        setTodoDefaultFilter(settings.todoDefaultFilter ?? 'all');
    }, [settings.todoDefaultFilter]);

    useEffect(() => {
        setReviewSortOrder(normalizeReviewSortOrder(settings.reviewSortOrder));
    }, [settings.reviewSortOrder]);

    useEffect(() => {
        setCompleteExitBehavior(settings.completeExitBehavior ?? 'mindmap_only');
    }, [settings.completeExitBehavior]);

    useEffect(() => {
        setKanbanSortOrder(settings.kanbanSortOrder ?? 'type_then_number');
    }, [settings.kanbanSortOrder]);

    useEffect(() => {
        if (!isOnline) {
            setDailyPortionMode('reading');
            return;
        }
        setDailyPortionMode(settings.dailyPortionMode ?? 'audio');
    }, [isOnline, settings.dailyPortionMode]);

    useEffect(() => {
        setDailyReadingStyle(settings.dailyReadingStyle ?? 'line_by_line');
    }, [settings.dailyReadingStyle]);

    useEffect(() => {
        setTodayDefaultMode(settings.todayDefaultMode ?? 'daily');
    }, [settings.todayDefaultMode]);

    useEffect(() => {
        setCompletionDaysDraft(settings.completionDays || 30);
    }, [settings.completionDays]);

    useEffect(() => () => {
        if (completionDaysSaveTimerRef.current !== null) {
            window.clearTimeout(completionDaysSaveTimerRef.current);
            completionDaysSaveTimerRef.current = null;
        }
    }, []);

    const latestSubscription = useMemo(() => {
        if (!subscriptions.length) return null;

        const sorted = [...subscriptions].sort((a, b) => {
            const aTime = Date.parse(a?.updatedAt ?? '') || 0;
            const bTime = Date.parse(b?.updatedAt ?? '') || 0;
            return bTime - aTime;
        });
        return sorted[0] ?? null;
    }, [subscriptions]);

    useEffect(() => {
        void loadAccountDeletionStatus();
    }, [loadAccountDeletionStatus]);

    useEffect(() => {
        if (!user?.id) {
            setBillingSummary({ nextRenewalAt: null, canManageSubscription: false });
            return;
        }

        const canManageFromLocal = Boolean(
            String(latestSubscription?.paddleCustomerId ?? '').trim()
            && String(latestSubscription?.paddleSubscriptionId ?? '').trim(),
        );

        if (!isOnline) {
            setBillingSummary({
                nextRenewalAt: null,
                canManageSubscription: canManageFromLocal,
            });
            return;
        }

        let cancelled = false;

        const loadBillingSummary = async () => {
            try {
                const response = await fetch('/api/paddle/billing-summary', {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store',
                });

                if (!response.ok) {
                    throw new Error('Failed to load billing summary.');
                }

                const payload = await response.json();
                if (cancelled) return;

                setBillingSummary({
                    nextRenewalAt:
                        typeof payload?.billing?.nextRenewalAt === 'string' && payload.billing.nextRenewalAt
                            ? payload.billing.nextRenewalAt
                            : null,
                    canManageSubscription: Boolean(payload?.billing?.canManageSubscription || canManageFromLocal),
                });
            } catch {
                if (cancelled) return;
                setBillingSummary({
                    nextRenewalAt: null,
                    canManageSubscription: canManageFromLocal,
                });
            }
        };

        void loadBillingSummary();

        return () => {
            cancelled = true;
        };
    }, [
        isOnline,
        latestSubscription?.id,
        latestSubscription?.paddleCustomerId,
        latestSubscription?.paddleSubscriptionId,
        user?.id,
    ]);

    const billingStatus = latestSubscription?.status ?? 'none';
    const isActiveBilling = ACTIVE_SUBSCRIPTION_STATUSES.has(billingStatus);
    const hasPendingDeletionRequest = accountDeletionStatus.pending && accountDeletionStatus.canCancel;
    const accountDeletionDaysLeft = accountDeletionStatus.daysUntilAccessEnds ?? getDaysUntilIso(accountDeletionStatus.expiresAt);
    const accountDeletionDaysLabel = formatDaysLabel(accountDeletionDaysLeft);
    const accountDeletionWindowEnds = accountDeletionStatus.expiresAt
        ? formatBillingDate(accountDeletionStatus.expiresAt)
        : 'the end of your current billing period';
    const billingPlan =
        latestSubscription?.priceId === paddlePriceIds.monthly
            ? 'Monthly'
            : latestSubscription?.priceId === paddlePriceIds.yearly
                ? 'Yearly'
                : latestSubscription?.priceId
                    ? 'Custom'
                    : 'N/A';
    const billingNextRenewal = billingStatus === 'none'
        ? 'N/A'
        : billingSummary.nextRenewalAt
            ? formatBillingDate(billingSummary.nextRenewalAt)
            : (isActiveBilling ? 'Unavailable' : 'N/A');
    const preDeleteDaysLeft = getDaysUntilIso(billingSummary.nextRenewalAt);
    const preDeleteDaysLabel = formatDaysLabel(preDeleteDaysLeft);
    const preDeleteEndDateLabel = billingSummary.nextRenewalAt ? formatBillingDate(billingSummary.nextRenewalAt) : null;
    const deleteFeedbackModalMessage = preDeleteEndDateLabel
        ? `Before you leave, tell us why. You will lose app access in ${preDeleteDaysLabel ?? '0 days'} (${preDeleteEndDateLabel}) once renewal is stopped.`
        : 'Before you leave, tell us why.';

    const renderBillingInfo = () => (
        <div
            className="billing-info-card"
            style={{
                marginBottom: '1rem',
                padding: '0.9rem',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--background)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                <CreditCard size={16} style={{ color: 'var(--accent)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Billing Information</span>
            </div>
            <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ color: 'var(--foreground-secondary)' }}>Status</span>
                    <span style={{ fontWeight: 600, color: isActiveBilling ? '#16a34a' : 'var(--foreground)' }}>
                        {billingStatus === 'none' ? 'No subscription' : billingStatus}
                    </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ color: 'var(--foreground-secondary)' }}>Plan</span>
                    <span style={{ fontWeight: 600 }}>{billingPlan}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ color: 'var(--foreground-secondary)' }}>Renews On</span>
                    <span style={{ fontWeight: 600, textAlign: 'right' }}>{billingNextRenewal}</span>
                </div>
            </div>
        </div>
    );

    const renderSignedInAccountActions = () => (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '0.75rem',
                alignItems: 'stretch',
            }}>
                <button
                    className="btn btn-secondary std-normal-btn account-action-btn account-action-btn--manage"
                    onClick={handleOpenCustomerPortal}
                    disabled={!isOnline || !billingSummary.canManageSubscription || isOpeningPortal}
                    style={{
                        width: '100%',
                        minWidth: 0,
                        padding: '0.85rem 0.65rem',
                        borderRadius: '12px',
                        fontFamily: 'inherit',
                        fontWeight: 600,
                        fontSize: '0.86rem',
                        lineHeight: 1.2,
                        textAlign: 'center',
                        cursor: 'pointer'
                    }}
                >
                    {isOpeningPortal ? 'Opening billing portal...' : 'Manage Subscription'}
                </button>
                <button
                    className="btn btn-secondary std-normal-btn account-action-btn"
                    onClick={handleSignOut}
                    style={{
                        width: '100%',
                        minWidth: 0,
                        padding: '0.85rem 0.65rem',
                        borderRadius: '12px',
                        fontFamily: 'inherit',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        lineHeight: 1.2,
                        textAlign: 'center',
                        cursor: 'pointer'
                    }}
                >
                    Sign Out
                </button>
                <button
                    className={`btn std-normal-btn account-action-btn ${hasPendingDeletionRequest ? 'btn-secondary' : 'std-normal-danger'}`}
                    onClick={hasPendingDeletionRequest ? handleCancelDeletionRequest : handleDeleteAccount}
                    disabled={!isOnline || isDeletingAccount || isCancellingDeletion || isDeleteFeedbackModalOpen}
                    style={{
                        width: '100%',
                        minWidth: 0,
                        padding: '0.85rem',
                        borderRadius: '12px',
                        fontFamily: 'inherit',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        lineHeight: 1.2,
                        textAlign: 'center',
                        cursor: 'pointer'
                    }}
                >
                    {hasPendingDeletionRequest
                        ? (isCancellingDeletion ? 'Restoring renewal...' : 'Keep Account & Renewal')
                        : (isDeletingAccount ? 'Stopping renewal...' : 'Delete & Stop Renewal')}
                </button>
            </div>

            {hasPendingDeletionRequest && (
                <p style={{
                    margin: 0,
                    padding: '0.65rem 0.75rem',
                    borderRadius: '10px',
                    border: '1px solid color-mix(in srgb, var(--accent) 28%, var(--border))',
                    background: 'color-mix(in srgb, var(--accent) 10%, var(--background))',
                    color: 'var(--foreground-secondary)',
                    fontSize: '0.82rem',
                    lineHeight: 1.4
                }}>
                    Deletion request is active. Future subscription renewals are canceled.
                    {accountDeletionDaysLabel
                        ? ` ${accountDeletionDaysLabel} left until access ends.`
                        : ''}
                    {' '}Cancel before <strong>{accountDeletionWindowEnds}</strong> to keep your account.
                </p>
            )}
        </div>
    );

    const renderMobileView = () => {

        if (activeMobilePage === 'account') {
            return (
                <div className="content-wrapper tab-content">
                    <div
                        onClick={() => setActiveMobilePage(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', cursor: 'pointer' }}
                    >
                        <button onClick={() => setActiveMobilePage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <ChevronLeft size={28} />
                        </button>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Account & Appearance</h1>
                    </div>

                    <div className="card modern-card" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Database size={18} /> User Account
                        </h2>
                        <p style={{ marginBottom: '1rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>
                            {user
                                ? `Signed in as ${user.email}. Your data is synced automatically.`
                                : "Sign in to sync your progress across devices."}
                        </p>
                        {user && renderBillingInfo()}

                        <div style={{ opacity: isOnline ? 1 : 0.45, pointerEvents: isOnline ? 'auto' : 'none' }}>
                            {!isOnline && (
                                <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}>
                                    <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Offline</div>
                                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '0.85rem' }}>
                                        Cloud sync and authentication are paused. Keep using the app; changes will sync when online.
                                    </div>
                                </div>
                            )}

                            {user ? (
                                <>
                                    {renderSignedInAccountActions()}
                                </>
                            ) : (
                                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {authStep === 'email' ? (
                                        <input
                                            suppressHydrationWarning={true}
                                            type="email"
                                            placeholder="Enter your email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            placeholder="Enter verification code"
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            required
                                            style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                                        />
                                    )}
                                    {authError && <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>{authError}</p>}
                                    <button
                                        suppressHydrationWarning={true}
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={isAuthProcessing}
                                        style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}
                                    >
                                        {isAuthProcessing ? 'Processing...' : (authStep === 'email' ? 'Send Code' : 'Verify Code')}
                                    </button>

                                    {authStep === 'email' && (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0', gap: '0.75rem' }}>
                                                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)' }}>or</span>
                                                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                                            </div>

                                            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                    <GoogleLogin
                                                        nonce={googleNonce}
                                                        theme="outline"
                                                        shape="pill"
                                                        size="large"
                                                        width="100%"
                                                        text="continue_with"
                                                        onError={() => {
                                                            console.error('Google login failed');
                                                            setAuthError('Google login failed');
                                                        }}
                                                        onSuccess={({ credential }) => {
                                                            if (!credential) return;
                                                            setIsAuthProcessing(true);
                                                            db.auth
                                                                .signInWithIdToken({
                                                                    clientName: GOOGLE_CLIENT_NAME,
                                                                    idToken: credential,
                                                                    nonce: googleNonce,
                                                                })
                                                                .catch((err) => {
                                                                    console.error('InstantDB Google auth error:', err);
                                                                    setAuthError('Uh oh: ' + (err.body?.message || err.message));
                                                                })
                                                                .finally(() => {
                                                                    setIsAuthProcessing(false);
                                                                });
                                                        }}
                                                    />
                                                </div>
                                            </GoogleOAuthProvider>
                                        </>
                                    )}
                                </form>
                            )}
                        </div>
                    </div>

                    <div className="card modern-card" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Palette size={18} /> Theme Mode
                        </h2>
                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            Choose how Quran Life looks for you.
                        </p>
                        <div style={{ display: 'flex', gap: '0.65rem' }}>
                            {THEME_MODE_OPTIONS.map((mode) => (
                                <button
                                    key={mode.id}
                                    className="appearance-choice-btn"
                                    onClick={() => handleThemeSelect(mode.id)}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.75rem 0.5rem',
                                        borderRadius: '12px',
                                        border: theme === mode.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                                        background: theme === mode.id ? 'var(--verse-bg)' : 'var(--background)',
                                        color: theme === mode.id ? 'var(--accent)' : 'var(--foreground-secondary)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        boxShadow: theme === mode.id ? '0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent)' : 'none',
                                    }}
                                >
                                    <mode.icon size={20} />
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{mode.label}</span>
                                </button>
                            ))}
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                            <p style={{ color: 'var(--foreground-secondary)', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                                Accent theme
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.6rem' }}>
                                {ACCENT_THEME_OPTIONS.map((option) => {
                                    const isActive = accentTheme === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            className="appearance-choice-btn"
                                            onClick={() => handleAccentThemeSelect(option.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '0.75rem 0.7rem',
                                                borderRadius: '10px',
                                                border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                                                background: isActive ? 'var(--verse-bg)' : 'var(--background)',
                                                color: isActive ? 'var(--accent)' : 'var(--foreground-secondary)',
                                                cursor: 'pointer',
                                                fontSize: '0.78rem',
                                                fontWeight: isActive ? 600 : 500,
                                            }}
                                        >
                                            <span
                                                aria-hidden
                                                style={{
                                                    width: '12px',
                                                    height: '12px',
                                                    borderRadius: '999px',
                                                    background: option.accent,
                                                    border: '1px solid color-mix(in srgb, var(--foreground) 16%, transparent)',
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {option.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (activeMobilePage === 'plan') {
            return (
                <div className="content-wrapper tab-content">
                    <div
                        onClick={() => setActiveMobilePage(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', cursor: 'pointer' }}
                    >
                        <button onClick={() => setActiveMobilePage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <ChevronLeft size={28} />
                        </button>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Memorization Plan</h1>
                    </div>

                    <div className="card modern-card" style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Clock size={18} /> Completion Schedule
                            </h2>
                            <button
                                className="bulk-btn reset-mut"
                                onClick={handleResetDailyPortion}
                                title="Reset daily portion progress for the active part"
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                            >
                                <RotateCcw size={14} /> Reset
                            </button>
                        </div>
                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            Set how many days you want to complete one full cycle of your active part.
                        </p>
                        <DailyCompletionSlider
                            days={completionDaysDraft}
                            onChange={handleCompletionDays}
                            activePart={settings.activePart}
                        />
                    </div>

                    <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Book size={18} /> Active Part
                        </h2>
                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            Choose the part you are focusing on for your daily portion and todo flow.
                        </p>
                        <div className="part-selector" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                            gap: '0.75rem'
                        }}>
                            {ACTIVE_PART_OPTIONS.map(p => (
                                <button
                                    suppressHydrationWarning={true}
                                    key={p.id}
                                    className={`part-option ${settings.activePart === p.id ? 'active' : ''}`}
                                    onClick={() => handleActivePart(p.id as QuranPart)}
                                    style={{
                                        padding: '1.25rem 0.75rem',
                                        borderRadius: '16px',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        textAlign: 'center',
                                        gap: '0.25rem',
                                    }}
                                >
                                    <div className="part-number" style={{ fontSize: '1.4rem', fontWeight: 800, color: settings.activePart === p.id ? 'var(--accent)' : 'var(--foreground-secondary)' }}>
                                        {p.id === ALL_QURAN_PART ? '∞' : p.id}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: settings.activePart === p.id ? 'var(--accent)' : 'var(--foreground-secondary)' }}>{p.name}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--foreground-secondary)', opacity: 0.8 }}>{getSurahsByPart(p.id as QuranPart).length} surahs</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        if (activeMobilePage === 'tracking') {
            return (
                <div className="content-wrapper tab-content">
                    <div
                        onClick={() => setActiveMobilePage(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', cursor: 'pointer' }}
                    >
                        <button onClick={() => setActiveMobilePage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <ChevronLeft size={28} />
                        </button>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Progress Tracking</h1>
                    </div>

                    <div className="card modern-card" style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Check size={18} /> Skipped Surah
                        </h2>
                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            Search and add Surahs you want to skip (e.g., ones you know perfectly).
                        </p>
                        <div className="add-skipped-container" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <select
                                value={surahToSkipId}
                                onChange={(e) => setSurahToSkipId(e.target.value ? Number(e.target.value) : '')}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--background)',
                                    color: 'var(--foreground)',
                                    fontSize: '0.95rem'
                                }}
                            >
                                <option value="">Select Surah to Skip...</option>
                                {SURAHS.filter(s => s.id !== LOCKED_SKIPPED_SURAH_ID).map(s => (
                                    <option key={s.id} value={s.id} disabled={settings.skippedSurahs?.includes(s.id)}>
                                        {s.id}. {s.name} ({s.arabicName})
                                    </option>
                                ))}
                            </select>
                            <button
                                className="std-normal-btn"
                                onClick={handleAddSkippedSurah}
                                disabled={!surahToSkipId}
                                style={{
                                    padding: '0 1.25rem',
                                    borderRadius: '12px',
                                    fontWeight: 600,
                                    cursor: surahToSkipId ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Add
                            </button>
                        </div>

                        <div className="skipped-surahs-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {(!settings.skippedSurahs || settings.skippedSurahs.length === 0) && (
                                <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem', fontStyle: 'italic', width: '100%' }}>No surahs skipped.</p>
                            )}
                            {settings.skippedSurahs?.map(id => {
                                const s = SURAHS.find(surah => surah.id === id);
                                if (!s) return null;
                                return (
                                    <div key={id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '20px',
                                        background: 'var(--background)',
                                        border: '1px solid var(--border)',
                                        fontSize: '0.9rem'
                                    }}>
                                        <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{s.name}</span>
                                        {id === LOCKED_SKIPPED_SURAH_ID ? (
                                            <span style={{ fontSize: '0.78rem', color: 'var(--foreground-secondary)' }}>Always skipped</span>
                                        ) : (
                                            <button
                                                onClick={() => handleRemoveSkippedSurah(id)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--foreground-secondary)',
                                                    cursor: 'pointer',
                                                    padding: '2px',
                                                    display: 'flex',
                                                    alignItems: 'center'
                                                }}
                                                title="Unskip (Add back to cycle)"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="card modern-card" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                                <Activity size={18} /> Knowledge Tracking
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {isMobile ? (
                                    <select
                                        className="maturity-select"
                                        value={knowledgeFilter}
                                        onChange={(e) => setKnowledgeFilter(e.target.value as any)}
                                        style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                                    >
                                        <option value="all">All</option>
                                        <option value="overdue">Overdue</option>
                                        <option value="today">Due Today</option>
                                        <option value="upcoming">Upcoming</option>
                                        <option value="not_due">Not Due</option>
                                    </select>
                                ) : (
                                    <div className="segmented-compact segmented-compact--small">
                                        {[
                                            { id: 'all', label: 'ALL' },
                                            { id: 'overdue', label: 'OVERDUE' },
                                            { id: 'today', label: 'DUE TODAY' },
                                            { id: 'upcoming', label: 'UPCOMING' },
                                            { id: 'not_due', label: 'NOT DUE' }
                                        ].map((f) => (
                                            <button
                                                key={f.id}
                                                suppressHydrationWarning={true}
                                                onClick={() => setKnowledgeFilter(f.id as any)}
                                                className={`adv-seg-btn ${knowledgeFilter === f.id ? 'adv-seg-active' : ''}`}
                                                style={{ flex: 1 }}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {hasExpandedKnowledgeItems && (
                                    <button
                                        className="bulk-btn reset-mut"
                                        data-tooltip-disabled="true"
                                        onClick={foldKnowledgeTrackingItems}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                                    >
                                        <ChevronDown size={14} style={{ transform: 'rotate(180deg)' }} />
                                        <span>Fold All</span>
                                    </button>
                                )}
                            </div>
                        </div>
                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            This section shows your review schedules.
                        </p>
                        <div className="knowledge-groups-mobile">
                            {/* MINDMAPS MOBILE GROUP */}
                            <div className="mobile-group-item">
                                <div className="mobile-group-header" onClick={() => toggleGroup('mindmaps')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <MapIcon size={20} />
                                        <span style={{ fontWeight: 600 }}>Mindmaps</span>
                                    </div>
                                    <ChevronDown size={20} style={{ transform: expandedGroups['mindmaps'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>
                                {expandedGroups['mindmaps'] && (
                                    <div className="mobile-subgroup-list">
                                        <div className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                            id: 'mindmaps-part',
                                            title: 'Part Mindmaps',
                                            type: 'part_mindmap' as any as any,
                                            nodes: filteredPartMindmaps
                                        })}>
                                            <span>Part Mindmaps</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="status-badge">{filteredPartMindmaps.length}</span>
                                                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                            </div>
                                        </div>
                                        <div className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                            id: 'mindmaps-surah',
                                            title: 'Surah Mindmaps',
                                            type: 'mindmap' as any as any,
                                            nodes: filteredSurahMindmaps
                                        })}>
                                            <span>Surah Mindmaps</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="status-badge">{filteredSurahMindmaps.length}</span>
                                                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* VERSES MOBILE GROUP */}
                            <div className="mobile-group-item">
                                <div className="mobile-group-header" onClick={() => toggleGroup('verses')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Book size={20} />
                                        <span style={{ fontWeight: 600 }}>Verses</span>
                                    </div>
                                    <ChevronDown size={20} style={{ transform: expandedGroups['verses'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>
                                {expandedGroups['verses'] && (
                                    <div className="mobile-subgroup-list">
                                        {/* Issue #10: Filter by active part */}
                                        {(() => {
                                            // Get all eligible surahs for the current active part
                                            const eligibleSurahs = SURAHS.filter(s =>
                                                (settings.activePart === ALL_QURAN_PART || s.part === settings.activePart) &&
                                                !settings.skippedSurahs?.includes(s.id)
                                            ).sort((a, b) => a.id - b.id);

                                            if (eligibleSurahs.length === 0) {
                                                return (
                                                    <div className="empty-state" style={{ padding: '1rem' }}>No surahs in {activePartLabel}</div>
                                                );
                                            }

                                            const visibleSurahs = knowledgeFilter === 'all'
                                                ? eligibleSurahs
                                                : eligibleSurahs.filter(surah => filteredVerseSegments.some(n => n.type === 'verse_segment' && resolveNodeSurahId(n) === surah.id));

                                            if (visibleSurahs.length === 0) {
                                                return (
                                                    <div className="empty-state" style={{ padding: '1rem' }}>No items match this filter.</div>
                                                );
                                            }

                                            return visibleSurahs.map(surah => {
                                                const surahId = surah.id;
                                                const surahNodes = knowledgeFilter === 'all'
                                                    ? latestVerseSegments.filter(n => n.type === 'verse_segment' && resolveNodeSurahId(n) === surahId)
                                                    : filteredVerseSegments.filter(n => n.type === 'verse_segment' && resolveNodeSurahId(n) === surahId);

                                                // Always show the surah group when showing all items, even if no nodes exist yet (0 items)
                                                // This allows users to set maturity for the whole group before starting reviews
                                                return (
                                                    <div key={surahId} className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                        id: `verse-surah-${surahId}`,
                                                        title: `${surah.id}. ${surah.name}`,
                                                        type: 'verse_segment',
                                                        nodes: surahNodes,
                                                        surahId
                                                    })}>
                                                        <span>{surah.name}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="card modern-card" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Brain size={18} /> Similar Verse Coverage
                        </h2>
                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            Surahs with similar verses in this part. Tap to expand and annotate similar ayat.
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                            <button
                                className="bulk-btn learned"
                                onClick={() => {
                                    setTargetSurahId(undefined);
                                    setIsAddModalOpen(true);
                                }}
                                title="Add Custom Mutashabih"
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                            >
                                <Plus size={14} /> <span>Add Custom</span>
                            </button>
                            <button
                                className="bulk-btn reset-mut"
                                onClick={handleResetMutashabihat}
                                title="Reset all mutashabihat decisions for this part"
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                            >
                                <RotateCcw size={14} /> <span>Reset Decisions</span>
                            </button>
                            {hasExpandedSimilarVerseItems && (
                                <button
                                    className="bulk-btn reset-mut"
                                    data-tooltip-disabled="true"
                                    onClick={foldSimilarVerseItems}
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                                >
                                    <ChevronDown size={14} style={{ transform: 'rotate(180deg)' }} />
                                    <span>Fold All</span>
                                </button>
                            )}
                        </div>
                        <div className="knowledge-groups-mobile">
                            {mutashabihatSurahs.map(({ surah, count }) => {
                                const isOpen = expandedSurahs[surah.id] ?? false;

                                const groups = buildSurahMutGroups(surah.id);

                                return (
                                    <div key={surah.id} className="mobile-group-item">
                                        <div className="mobile-group-header" onClick={() => setExpandedSurahs(prev => ({ ...prev, [surah.id]: !isOpen }))}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <span style={{
                                                    width: '24px', height: '24px', borderRadius: '6px',
                                                    background: 'var(--accent)', color: 'white',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.75rem', fontWeight: 700
                                                }}>{surah.id}</span>
                                                <span style={{ fontWeight: 600 }}>{surah.name}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="status-badge" style={{ background: 'var(--accent-light)', color: 'white' }}>{count}</span>
                                                <ChevronDown size={20} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                            </div>
                                        </div>
                                        {isOpen && (
                                            <div className="mobile-subgroup-list">
                                                {groups.map(group => {
                                                    const representativeAbs = group.representativeAbs;
                                                    const decisionKey = group.decisionKey;
                                                    const existing = decisions[decisionKey] || { status: 'pending', notes: '' };
                                                    const isConfirmed = group.resolutionTargets.some(target => !!decisions[target.decisionKey]?.confirmedAt);

                                                    return (
                                                        <div key={decisionKey} className="mobile-subgroup-item" onClick={() => setActiveMutSlideOver({
                                                            id: decisionKey,
                                                            title: `${surah.name} - Ayah ${group.ayahIds.join(', ')}`,
                                                            surahId: surah.id,
                                                            phraseId: group.phraseId,
                                                            group,
                                                            representativeAbs
                                                        })}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                                                    {group.ayahIds.length > 1 ? `Ayat ${group.ayahIds.sort((a, b) => a - b).join(', ')}` : `Ayah ${group.ayahIds[0]}`}
                                                                </span>
                                                                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                                                                    {group.matchCount} matches
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                {isConfirmed && <Check size={16} style={{ color: '#22c55e' }} />}
                                                                <span className={`status-badge ${existing.status !== 'pending' ? 'active' : ''}`} style={{
                                                                    fontSize: '0.65rem',
                                                                    background: existing.status === 'pending' ? 'var(--border)' : 'var(--accent)',
                                                                    color: 'white'
                                                                }}>
                                                                    {MUT_STATES.find(s => s.value === existing.status)?.label.split(' ')[0]}
                                                                </span>
                                                                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        if (activeMobilePage === 'advanced') {
            const currentTodoFilter = todoDefaultFilter ?? 'all';
            const currentReviewSort = reviewSortOrder ?? 'surah_grouped';
            const currentExitBehavior = completeExitBehavior ?? 'mindmap_only';

            return (
                <div className="content-wrapper tab-content">
                    <div
                        onClick={() => setActiveMobilePage(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', cursor: 'pointer' }}
                    >
                        <button onClick={() => setActiveMobilePage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <ChevronLeft size={28} />
                        </button>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Advanced Options</h1>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <p style={{ color: 'var(--foreground-secondary)', margin: 0, fontSize: '0.9rem' }}>
                            Choose defaults and behaviors for your workflow.
                        </p>
                        <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                            <h2 className="adv-section-title" style={{ marginBottom: '0.5rem' }}>
                                <span className="adv-section-icon">
                                    <Sliders size={16} />
                                </span>
                                <span>Sorting & Filters</span>
                            </h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Default Todo Filter</div>
                                    <div className="adv-chip-row">
                                        {todoFilterOptions.map((option) => {
                                            const isActive = currentTodoFilter === option.id;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setTodoDefaultFilter(option.id);
                                                        persistSettingsUpdate({ todoDefaultFilter: option.id }, 'default todo filter');
                                                    }}
                                                    className={`adv-chip ${isActive ? 'adv-chip-active' : ''}`}
                                                >
                                                    {isActive && <Check size={14} className="adv-check" />}
                                                    <span>{option.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Review Sorting</div>
                                    <div className="adv-chip-row">
                                        {reviewSortOptions.map((option) => {
                                            const isActive = currentReviewSort === option.id;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setReviewSortOrder(option.id);
                                                        persistSettingsUpdate({ reviewSortOrder: option.id }, 'review sorting');
                                                    }}
                                                    className={`adv-chip ${isActive ? 'adv-chip-active' : ''}`}
                                                >
                                                    {isActive && <Check size={14} className="adv-check" />}
                                                    <span>{option.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Kanban Card Sorting</div>
                                    <div className="adv-chip-row">
                                        {kanbanSortOptions.map((option) => {
                                            const isActive = (kanbanSortOrder ?? 'type_then_number') === option.id;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setKanbanSortOrder(option.id);
                                                        persistSettingsUpdate({ kanbanSortOrder: option.id }, 'kanban sorting');
                                                    }}
                                                    className={`adv-chip ${isActive ? 'adv-chip-active' : ''}`}
                                                >
                                                    {isActive && <Check size={14} className="adv-check" />}
                                                    <span>{option.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                            <h2 className="adv-section-title" style={{ marginBottom: '0.5rem' }}>
                                <span className="adv-section-icon">
                                    <Activity size={16} />
                                </span>
                                <span>Workflow Behaviors</span>
                            </h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>When Moving Out of Complete</div>
                                    <div className="adv-segmented">
                                        {completeExitOptions.map((option) => {
                                            const isActive = currentExitBehavior === option.id;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => {
                                                        void handleCompleteExitBehaviorChange(option.id);
                                                    }}
                                                    className={`adv-seg-btn ${isActive ? 'adv-seg-active' : ''}`}
                                                >
                                                    {isActive && <Check size={14} className="adv-check" />}
                                                    <span>{option.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Daily Portion Default Mode</div>
                                    <div className="adv-segmented">
                                        {dailyPortionModeOptions.map((option) => {
                                            const isActive = (dailyPortionMode ?? 'audio') === option.id;
                                            const isListeningOption = option.id === 'audio';
                                            const disableListeningOption = !isOnline && isListeningOption;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    aria-disabled={disableListeningOption}
                                                    disabled={disableListeningOption}
                                                    onClick={() => {
                                                        if (disableListeningOption) return;
                                                        setDailyPortionMode(option.id);
                                                        persistSettingsUpdate({ dailyPortionMode: option.id }, 'daily portion default mode');
                                                    }}
                                                    className={`adv-seg-btn ${isActive ? 'adv-seg-active' : ''}`}
                                                    style={disableListeningOption ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                                                    title={disableListeningOption ? 'Listening mode is unavailable offline' : undefined}
                                                >
                                                    {isActive && <Check size={14} className="adv-check" />}
                                                    <span>{option.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Reading Mode Layout</div>
                                    <div className="adv-segmented">
                                        {dailyReadingStyleOptions.map((option) => {
                                            const isActive = (dailyReadingStyle ?? 'line_by_line') === option.id;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setDailyReadingStyle(option.id);
                                                        persistSettingsUpdate({ dailyReadingStyle: option.id }, 'daily reading style');
                                                    }}
                                                    className={`adv-seg-btn ${isActive ? 'adv-seg-active' : ''}`}
                                                >
                                                    {isActive && <Check size={14} className="adv-check" />}
                                                    <span>{option.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Today Page Default Section in mobile</div>
                                    <div className="adv-segmented">
                                        {todayDefaultModeOptions.map((option) => {
                                            const isActive = (todayDefaultMode ?? 'daily') === option.id;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setTodayDefaultMode(option.id);
                                                        persistSettingsUpdate({ todayDefaultMode: option.id }, 'today default mode');
                                                    }}
                                                    className={`adv-seg-btn ${isActive ? 'adv-seg-active' : ''}`}
                                                >
                                                    {isActive && <Check size={14} className="adv-check" />}
                                                    <span>{option.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="content-wrapper tab-content">
                {/* <h1 className="text-2xl font-bold mb-6">Settings</h1> */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <button onClick={() => setActiveMobilePage('account')} className="modern-card" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem', background: 'var(--background-secondary)',
                        border: '1px solid var(--border)', borderRadius: '16px',
                        cursor: 'pointer', textAlign: 'left', width: '100%'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="header-icon-badge">
                                <Database size={20} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Account & Appearance</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)', marginTop: '2px' }}>Sync, Billing, Themes</div>
                            </div>
                        </div>
                        <ChevronRight size={24} style={{ color: 'var(--foreground-secondary)' }} />
                    </button>

                    <button onClick={() => setActiveMobilePage('plan')} className="modern-card" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem', background: 'var(--background-secondary)',
                        border: '1px solid var(--border)', borderRadius: '16px',
                        cursor: 'pointer', textAlign: 'left', width: '100%'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="header-icon-badge">
                                <Clock size={20} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Memorization Plan</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)', marginTop: '2px' }}>Schedule, Active Part</div>
                            </div>
                        </div>
                        <ChevronRight size={24} style={{ color: 'var(--foreground-secondary)' }} />
                    </button>

                    <button onClick={() => setActiveMobilePage('tracking')} className="modern-card" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem', background: 'var(--background-secondary)',
                        border: '1px solid var(--border)', borderRadius: '16px',
                        cursor: 'pointer', textAlign: 'left', width: '100%'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="header-icon-badge">
                                <Activity size={20} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Progress Tracking</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)', marginTop: '2px' }}>Status, Knowledge, Similar Verses</div>
                            </div>
                        </div>
                        <ChevronRight size={24} style={{ color: 'var(--foreground-secondary)' }} />
                    </button>

                    <button onClick={() => setActiveMobilePage('advanced')} className="modern-card" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem', background: 'var(--background-secondary)',
                        border: '1px solid var(--border)', borderRadius: '16px',
                        cursor: 'pointer', textAlign: 'left', width: '100%'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="header-icon-badge">
                                <Sliders size={20} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Advanced Options</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)', marginTop: '2px' }}>Defaults, Behaviors</div>
                            </div>
                        </div>
                        <ChevronRight size={24} style={{ color: 'var(--foreground-secondary)' }} />
                    </button>

                    <div
                        className="settings-support-cta-mobile"
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            width: '100%',
                            paddingInline: '0.5rem',
                            gap: '0.6rem',
                            fontSize: '0.9rem',
                            color: 'var(--foreground-secondary)',
                            marginTop: '0.2rem',
                            marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.2rem)',
                        }}
                    >
                        <span style={{ color: 'var(--foreground-secondary)' }}>
                            Need support or more details? Join our Discord server.
                        </span>
                        <a
                            className="settings-support-discord-link"
                            href="https://discord.gg/6wy3YRG2qB"
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                color: 'var(--foreground-secondary)',
                                textDecoration: 'none',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                lineHeight: 1,
                                padding: '0.42rem 0.72rem',
                                borderRadius: '12px',
                                border: '1px solid var(--border)',
                                background: 'var(--background)',
                                transition: 'color 0.2s ease, border-color 0.2s ease, background 0.2s ease, transform 0.2s ease',
                            }}
                        >
                            Join Discord
                        </a>
                    </div>
                </div>
            </div>
        );
    };



    const ensureVersesLoaded = useCallback(async () => {
        if (hasLoadedVersesRef.current) return;
        hasLoadedVersesRef.current = true;
        try {
            const loadedVerses = await getQuranVerses();
            startTransition(() => {
                setVerses(loadedVerses);
            });
        } catch {
            hasLoadedVersesRef.current = false;
            startTransition(() => {
                setVerses([]);
            });
        }
    }, []);

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => {
            const nextValue = !prev[groupId];
            if (groupId === 'verses' && nextValue) {
                void ensureVersesLoaded();
            }
            return { ...prev, [groupId]: nextValue };
        });
    };

    const getMaturityState = (level: 'reset' | 'medium' | 'strong' | 'mastered') => {
        const now = new Date().toISOString();
        switch (level) {
            case 'reset':
                return {
                    due: now,
                    stability: 0,
                    difficulty: 0,
                    elapsed_days: 0,
                    scheduled_days: 0,
                    reps: 0,
                    lapses: 0,
                    state: 'New',
                    last_review: now
                };
            case 'medium':
                return {
                    due: new Date(Date.now() + 14 * 86400000).toISOString(),
                    stability: 14,
                    difficulty: 5,
                    reps: 3,
                    state: 'Review',
                    scheduled_days: 14,
                    last_review: now
                };
            case 'strong':
                return {
                    due: new Date(Date.now() + 30 * 86400000).toISOString(),
                    stability: 30,
                    difficulty: 5,
                    reps: 5,
                    state: 'Review',
                    scheduled_days: 30,
                    last_review: now
                };
            case 'mastered':
                return {
                    due: new Date(Date.now() + 90 * 86400000).toISOString(),
                    stability: 90,
                    difficulty: 5,
                    reps: 8,
                    state: 'Review',
                    scheduled_days: 90,
                    last_review: now
                };
        }
    };

    const handleNodeMaturityReset = async (nodeId: string, level: 'reset' | 'medium' | 'strong' | 'mastered') => {
        const node = instantNodes.find(n => n.id === nodeId);
        if (!node) return;

        const newState = getMaturityState(level);
        try {
            await saveInstantNode({
                ...node,
                scheduler: { ...(node.scheduler as any), ...newState } as any
            });
        } catch (error) {
            console.error('Failed to save node maturity', error);
            await alert({
                title: 'Save Failed',
                message: 'Could not update maturity. Please try again.',
            });
        }
    };

    const handleGroupMaturityReset = async (type: 'verse_segment' | 'mindmap' | 'part_mindmap' | 'verse', level: 'reset' | 'medium' | 'strong' | 'mastered', surahId?: number, surahName?: string) => {
        let typeLabel = '';
        if (surahName) {
            typeLabel = `all Verses for ${surahName}`;
        } else {
            typeLabel = type === 'verse_segment' || type === 'verse' ? 'all Verses' : (type === 'mindmap' ? 'all Surah Mindmaps' : 'all Part Mindmaps');
        }

        const ok = await confirm({
            title: 'Set Maturity',
            message: `Are you sure you want to set the maturity of ${typeLabel} to ${level}?`,
            confirmLabel: 'Update',
            isDestructive: true,
        });
        if (!ok) return;

        const targetType = type === 'verse' ? 'verse_segment' : type;
        const newState = getMaturityState(level);

        const nodesToUpdate = instantNodes.filter(node => {
            if (node.type !== targetType) return false;
            if (surahId && resolveNodeSurahId(node) !== surahId) return false;
            return true;
        });

        if (nodesToUpdate.length === 0) {
            await alert({
                title: 'Nothing to Update',
                message: 'No nodes found to update.',
            });
            return;
        }

        try {
            for (let i = 0; i < nodesToUpdate.length; i += MATURITY_UPDATE_BATCH_SIZE) {
                const batch = nodesToUpdate.slice(i, i + MATURITY_UPDATE_BATCH_SIZE);
                await Promise.all(batch.map((node) =>
                    saveInstantNode({
                        ...node,
                        scheduler: { ...(node.scheduler as any), ...newState } as any
                    })
                ));
            }
        } catch (error) {
            console.error('Failed to save group maturity', error);
            await alert({
                title: 'Save Failed',
                message: 'Could not update group maturity. Please try again.',
            });
        }
    };

    useEffect(() => {
        if (!Object.values(expandedSurahs).some(Boolean) && !expandedGroups['verses']) return;
        void ensureVersesLoaded();
    }, [expandedSurahs, expandedGroups, ensureVersesLoaded]);

    const handleCompletionDays = (days: number) => {
        const clamped = Math.max(7, Math.min(120, days));
        setCompletionDaysDraft(clamped);
        if (completionDaysSaveTimerRef.current !== null) {
            window.clearTimeout(completionDaysSaveTimerRef.current);
        }
        completionDaysSaveTimerRef.current = window.setTimeout(() => {
            void saveSettings({ completionDays: clamped }).catch((error) => {
                console.error('Failed to save completion schedule', error);
            });
            completionDaysSaveTimerRef.current = null;
        }, SETTINGS_WRITE_DEBOUNCE_MS);
    };

    const handleActivePart = (part: QuranPart) => {
        void saveSettings({ activePart: part }).catch((error) => {
            console.error('Failed to save active part', error);
        });
    };

    const handleThemeSelect = (nextTheme: Theme) => {
        setTheme(nextTheme);
        void saveSettings({ theme: nextTheme }).catch((error) => {
            console.error('Failed to save theme mode', error);
        });
    };

    const handleAccentThemeSelect = (nextAccentTheme: AccentTheme) => {
        setAccentTheme(nextAccentTheme);
        void saveSettings({ accentTheme: nextAccentTheme }).catch((error) => {
            console.error('Failed to save accent theme', error);
        });
    };

    const persistSettingsUpdate = (update: Partial<AppSettings>, context: string) => {
        void saveSettings(update).catch((error) => {
            console.error(`Failed to save ${context}`, error);
        });
    };

    const addToast = (type: 'success' | 'error', message: string, info?: string) => {
        const key = `${type}|${message}|${info || ''}`;
        const now = Date.now();
        if (lastToastRef.current && lastToastRef.current.key === key && now - lastToastRef.current.at < 500) {
            return;
        }
        lastToastRef.current = { key, at: now };
        const toastId = crypto.randomUUID();
        setToasts((prev) => [...prev, { id: toastId, type, message, info }]);
        window.setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 6000);
    };

    const handleCompleteExitBehaviorChange = async (nextBehavior: 'mindmap_only' | 'mindmap_and_verses') => {
        const prevBehavior = completeExitBehavior ?? 'mindmap_only';
        if (nextBehavior === prevBehavior) return;

        setCompleteExitBehavior(nextBehavior);
        persistSettingsUpdate({ completeExitBehavior: nextBehavior }, 'complete-exit behavior');

        const completeIds = new Set<string>((settings.kanbanColumns?.complete || []).map((id) => String(id)));
        const targets = instantMindmaps
            .map((mm: any) => {
                const surahId = Number(mm?.surahId);
                const anchors = Number.isFinite(surahId) && surahId > 0
                    ? getEffectiveSurahAnchors(surahId, mm)
                    : [];
                const explicitAnchorCount = Array.isArray(mm?.anchors) ? mm.anchors.length : 0;
                const usesAutoShortSurahGroup = anchors.length > 0 && explicitAnchorCount === 0;
                return { surahId, anchors, usesAutoShortSurahGroup };
            })
            .filter(({ surahId, anchors }) =>
                Number.isFinite(surahId) &&
                surahId > 0 &&
                anchors.length > 0 &&
                !completeIds.has(`surah-${surahId}`)
            );
        const autoShortTargets = targets.filter((target) => target.usesAutoShortSurahGroup).length;
        const targetScopeText = targets.length > 0
            ? `${targets.length} surah card(s) already outside Complete${autoShortTargets > 0 ? ` (${autoShortTargets} using automatic short-surah verse groups)` : ''}`
            : '';

        const currentSettingDescription = nextBehavior === 'mindmap_only'
            ? 'Current setting: Suspend Mindmap Only. When a surah leaves Complete, only the mindmap is suspended. Verse groups include manual splits and auto short-surah groups.'
            : 'Current setting: Suspend Mindmap + Verses. When a surah leaves Complete, both mindmap and verse groups are suspended. Verse groups include manual splits and auto short-surah groups.';

        const optionalQuestion = nextBehavior === 'mindmap_only'
            ? (
                targets.length > 0
                    ? `Also show verse groups now for ${targetScopeText}?`
                    : 'No surah cards outside Complete need verse-group updates now.\nKeep this setting for future moves only?'
            )
            : (
                targets.length > 0
                    ? `Also suspend verse groups now for ${targetScopeText}?`
                    : 'No surah cards outside Complete need verse-group suspension now.\nKeep this setting for future moves only?'
            );

        if (targets.length === 0) return;

        if (nextBehavior === 'mindmap_only') {
            const apply = await confirm({
                title: 'Optional: Apply To Existing Cards',
                message: `${currentSettingDescription}\n\nOptional:\n${optionalQuestion}`,
                confirmLabel: targets.length > 0 ? 'Show Verse Groups' : 'Keep Setting',
                cancelLabel: 'Keep As-Is',
            });
            if (!apply) return;

            try {
                let created = 0;
                for (const target of targets) {
                    for (const anchor of target.anchors) {
                        const startVerse = Number(anchor?.startVerse);
                        const endVerse = Number(anchor?.endVerse);
                        if (!Number.isFinite(startVerse) || !Number.isFinite(endVerse)) continue;
                        const exists = instantNodes.some((node) =>
                            node.type === 'verse_segment' &&
                            resolveNodeSurahId(node) === target.surahId &&
                            Number(node.startVerse) === startVerse &&
                            Number(node.endVerse) === endVerse
                        );
                        if (exists) continue;
                        const targetId = anchor?.id || `anchor-${target.surahId}-${startVerse}-${endVerse}`;
                        await saveInstantNode({
                            id: stableNodeId('memory_node', 'verse_segment', target.surahId, startVerse, endVerse),
                            type: 'verse_segment',
                            surahId: target.surahId,
                            startVerse,
                            endVerse,
                            targetId,
                            scheduler: createNewFSRSState(),
                            createdAt: new Date().toISOString(),
                        } as MemoryNode);
                        created += 1;
                    }
                }
                addToast(
                    'success',
                    'Applied',
                    created > 0
                        ? `Added ${created} verse group card(s) for existing out-of-complete mindmaps.`
                        : 'No verse group cards needed to be added.'
                );
            } catch (error) {
                console.error('Failed applying complete-exit behavior retroactively (show verses)', error);
                await alert({
                    title: 'Apply Failed',
                    message: 'Could not apply this change to existing cards. Please try again.',
                });
            }
            return;
        }

        const apply = await confirm({
            title: 'Optional: Apply To Existing Cards',
            message: `${currentSettingDescription}\n\nOptional:\n${optionalQuestion}`,
            confirmLabel: targets.length > 0 ? 'Suspend Verse Groups' : 'Keep Setting',
            cancelLabel: 'Keep As-Is',
        });
        if (!apply) return;

        try {
            const affectedVerseNodes = instantNodes.filter((node) =>
                node.type === 'verse_segment' &&
                targets.some((t) => resolveNodeSurahId(node) === t.surahId)
            );
            addToast(
                'success',
                'Applied',
                affectedVerseNodes.length > 0
                    ? `Suspended ${affectedVerseNodes.length} verse group card(s) for existing out-of-complete mindmaps (no data deleted).`
                    : 'No verse group cards were active for those cards.'
            );
        } catch (error) {
            console.error('Failed applying complete-exit behavior retroactively (suspend verses)', error);
            await alert({
                title: 'Apply Failed',
                message: 'Could not apply this change to existing cards. Please try again.',
            });
        }
    };

    const handleResetDailyPortion = async () => {
        if (!settings) return;
        const partName = settings.activePart === ALL_QURAN_PART ? 'the whole Quran' : `Part ${settings.activePart}`;
        const message = `Reset daily portion progress for ${partName}? This will restart the daily portion from the beginning and mark today as incomplete.`;
        const ok = await confirm({
            title: 'Reset Daily Portion',
            message,
            confirmLabel: 'Reset',
            isDestructive: true,
        });
        if (!ok) return;

        const entry = listeningProgress.find(p => p.partId === settings.activePart)
            ?? (settings.activePart === ALL_QURAN_PART && (settings.partSystemVersion ?? 1) < 2
                ? listeningProgress.find(p => p.partId === LEGACY_ALL_QURAN_PART)
                : undefined);
        if (entry?.id) {
            await db.transact(db.tx.listeningProgress[entry.id].delete());
        }
    };

    const handleResetMutashabihat = async () => {
        const partName = settings?.activePart === ALL_QURAN_PART ? 'the whole Quran' : `Part ${settings?.activePart}`;
        const msg = `Are you sure you want to reset ALL mutashabihat decisions for ${partName}? This cannot be undone.`;
        const ok = await confirm({
            title: 'Reset Mutashabihat',
            message: msg,
            confirmLabel: 'Reset',
            isDestructive: true,
        });
        if (!ok) return;

        const absoluteAyat = getAllMutashabihatRefs(instantCustomMutashabihat).filter(abs => {
            const ref = absoluteToSurahAyah(abs);
            const surah = getSurah(ref.surahId);
            return surah && (settings?.activePart === ALL_QURAN_PART || surah.part === settings?.activePart);
        });

        const ayahSet = new Set(absoluteAyat.map(String));
        const decisionsToDelete = instantDecisions.filter(d => {
            const abs = d.phraseId.split('-')[0];
            return ayahSet.has(abs);
        });

        if (decisionsToDelete.length > 0) {
            try {
                await db.transact(decisionsToDelete.map(d => db.tx.mutashabihatDecisions[d.id].delete()));
            } catch (error) {
                console.error('Failed to reset mutashabihat decisions', error);
                await alert({
                    title: 'Reset Failed',
                    message: 'Could not reset similar verse coverage. Please try again.',
                });
            }
        }
    };

    const [surahToSkipId, setSurahToSkipId] = useState<number | ''>('');

    const handleAddSkippedSurah = () => {
        if (!surahToSkipId) return;
        const nextSurahId = Number(surahToSkipId);
        if (nextSurahId === LOCKED_SKIPPED_SURAH_ID) {
            setSurahToSkipId('');
            return;
        }
        const currentSkipped = settings?.skippedSurahs || [];
        if (!currentSkipped.includes(nextSurahId)) {
            persistSettingsUpdate({ skippedSurahs: [...currentSkipped, nextSurahId] }, 'skipped surah list');
        }
        setSurahToSkipId('');
    };

    const handleRemoveSkippedSurah = (id: number) => {
        if (id === LOCKED_SKIPPED_SURAH_ID) return;
        const currentSkipped = settings?.skippedSurahs || [];
        persistSettingsUpdate({ skippedSurahs: currentSkipped.filter(s => s !== id) }, 'skipped surah list');
    };

const handleDecisionUpdate = async (_absoluteAyah: number, update: MutashabihatDecision, phraseId: string) => {
    const { id: _ignored, ...updateWithoutId } = update;
    const previousDecision = decisions[phraseId];

    // Convert undefined to null for database compatibility
    const cleanUpdate = {
        ...updateWithoutId,
        confirmedAt: updateWithoutId.confirmedAt ?? null
    };

    // Optimistic local update so UI reflects changes immediately
    setDecisions(prev => ({
        ...prev,
        [phraseId]: {
            ...(prev[phraseId] || { id: phraseId, phraseId, status: 'pending' }),
            ...cleanUpdate,
            phraseId
        } as MutashabihatDecision
    }));

    try {
        await updateInstantDecision(phraseId, cleanUpdate);
    } catch (error) {
        console.error('Failed to save similar verse decision', error);
        setDecisions(prev => {
            const next = { ...prev };
            if (previousDecision) {
                next[phraseId] = previousDecision;
            } else {
                delete next[phraseId];
            }
            return next;
        });
        await alert({
            title: 'Save Failed',
            message: 'Could not save similar verse update. Please try again.',
        });
    }
};

    const applyDecisionToTargets = (targets: SimilarityResolutionTarget[], updater: (existing: MutashabihatDecision) => MutashabihatDecision) => {
        targets.forEach(target => {
            const existing = decisions[target.decisionKey] || { id: target.decisionKey, phraseId: target.decisionKey, status: 'pending' };
            void handleDecisionUpdate(target.representativeAbs, updater(existing), target.decisionKey);
        });
    };

    const getSettingsBuilderState = useCallback((surahId: number): AnchorBuilderState => {
        const local = settingsAnchorBuilders[surahId];
        if (local) return local;

        const surahMeta = getSurah(surahId);
        const verseCount = surahMeta?.verseCount || 1;
        const mindmap = settingsMindmapsBySurah[surahId];
        if (mindmap?.anchors?.length) {
            const sorted = [...mindmap.anchors].sort((a: any, b: any) => a.startVerse - b.startVerse);
            const breaks = sorted
                .slice(0, -1)
                .map((a: any) => Math.min(Math.max(1, Number(a.endVerse) + 1), verseCount - 1));
            const labels: Record<number, string> = {};
            sorted.forEach((a: any, idx: number) => {
                labels[idx] = a.label;
            });
            return { breaks, labels };
        }
        return { breaks: [], labels: {} };
    }, [settingsAnchorBuilders, settingsMindmapsBySurah]);

    const handleSettingsAddBreak = useCallback((surahId: number, breakPoint: number) => {
        const current = getSettingsBuilderState(surahId);
        const nextBreaks = Array.from(new Set([...current.breaks, breakPoint])).sort((a, b) => a - b);
        setSettingsAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    }, [getSettingsBuilderState]);

    const handleSettingsRemoveBreak = useCallback((surahId: number, breakPoint: number) => {
        const current = getSettingsBuilderState(surahId);
        const nextBreaks = current.breaks.filter((b) => b !== breakPoint);
        setSettingsAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    }, [getSettingsBuilderState]);

    const handleSettingsSaveAnchors = useCallback(async (surahId: number, verseCount: number) => {
        const builder = getSettingsBuilderState(surahId);
        const boundaries = [1, ...builder.breaks, verseCount + 1];
        const anchors = boundaries.slice(0, -1).map((start, idx) => {
            const end = boundaries[idx + 1] - 1;
            const label = builder.labels[idx] || `Verses ${start}-${end}`;
            return {
                id: `anchor-${surahId}-${start}-${end}`,
                surahId,
                startVerse: start,
                endVerse: end,
                label,
            };
        });

        const existing = settingsMindmapsBySurah[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        await saveMindMap(surahId, {
            ...existing,
            anchors,
        });
    }, [getSettingsBuilderState, saveMindMap, settingsMindmapsBySurah]);

    const openMindmapFromMutContext = useCallback((surahId: number) => {
        setSettingsMindmapEditor({
            surahId,
            snapshot: settingsMindmapsBySurah[surahId]?.tldrawSnapshot
        });
    }, [settingsMindmapsBySurah]);

    const openSplitsFromMutContext = useCallback((surahId: number) => {
        setSettingsSplitsSurahId(surahId);
    }, []);

    const handleSettingsEditorSave = useCallback(async (snapshot: any, _images?: { light?: Blob; dark?: Blob }, shouldClose: boolean = true) => {
        if (!settingsMindmapEditor) return;
        const { surahId } = settingsMindmapEditor;
        const existing = settingsMindmapsBySurah[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        await saveMindMap(surahId, {
            ...existing,
            imageUrl: undefined,
            imageUrlDark: undefined,
            tldrawSnapshot: snapshot
        });
        if (shouldClose) setSettingsMindmapEditor(null);
    }, [settingsMindmapEditor, settingsMindmapsBySurah, saveMindMap]);

    const shiftSettingsContextVerse = useCallback((baseAbsRef: number, direction: 'before' | 'after') => {
        setSettingsContextVerseCursor((prev) => {
            const currentAbs = prev[baseAbsRef] ?? baseAbsRef;
            const currentRef = absoluteToSurahAyah(currentAbs);
            const surahMeta = getSurah(currentRef.surahId);
            if (!surahMeta) return prev;
            const nextAyah = direction === 'before' ? currentRef.ayahId - 1 : currentRef.ayahId + 1;
            if (nextAyah < 1 || nextAyah > surahMeta.verseCount) return prev;
            return {
                ...prev,
                [baseAbsRef]: surahAyahToAbsolute(currentRef.surahId, nextAyah)
            };
        });
    }, []);

    const resetSettingsContextVerse = useCallback((baseAbsRef: number) => {
        setSettingsContextVerseCursor((prev) => ({
            ...prev,
            [baseAbsRef]: baseAbsRef
        }));
    }, []);

    const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const handleAddCustomMutashabih = async (mut: any) => {
        const [s1, a1] = mut.verseId.split(':').map(Number);
        const [s2, a2] = mut.targetVerseId.split(':').map(Number);
        const abs1 = surahAyahToAbsolute(s1, a1);
        const abs2 = surahAyahToAbsolute(s2, a2);
        const skippedSurahs = new Set<number>(settings?.skippedSurahs || []);
        skippedSurahs.add(LOCKED_SKIPPED_SURAH_ID);
        if (skippedSurahs.has(s1) || skippedSurahs.has(s2)) {
            addToast('error', 'Cannot add custom mutashabih for skipped surahs');
            return false;
        }

        const toPairKey = (left: number, right: number) => {
            const min = Math.min(left, right);
            const max = Math.max(left, right);
            return `${min}:${max}`;
        };
        const incomingPairKey = toPairKey(abs1, abs2);

        const hasExistingCustomPair = instantCustomMutashabihat.some((existing: any) => {
            const [existingS1, existingA1] = String(existing?.verseId || '').split(':').map(Number);
            const [existingS2, existingA2] = String(existing?.targetVerseId || '').split(':').map(Number);
            if (!Number.isFinite(existingS1) || !Number.isFinite(existingA1) || !Number.isFinite(existingS2) || !Number.isFinite(existingA2)) {
                return false;
            }
            const existingAbs1 = surahAyahToAbsolute(existingS1, existingA1);
            const existingAbs2 = surahAyahToAbsolute(existingS2, existingA2);
            return toPairKey(existingAbs1, existingAbs2) === incomingPairKey;
        });

        const hasExistingOfficialPair = getMutashabihatForAbsolute(abs1)
            .filter((entry) => !entry.isCustom)
            .some((entry) => {
                const linkedRefs = new Set<number>([...entry.sources, ...entry.matches]);
                linkedRefs.delete(abs1);
                return linkedRefs.has(abs2);
            });

        if (hasExistingCustomPair || hasExistingOfficialPair) {
            const duplicateSource = hasExistingOfficialPair
                ? 'an existing built-in mutashabih'
                : 'an existing custom mutashabih';
            await alert({
                title: 'Duplicate Mutashabih',
                message: `This originator/comparator pair already exists in ${duplicateSource}. Please choose a different pair.`,
            });
            return false;
        }

        const customItem = {
            id: mut.id && isUuid(mut.id) ? mut.id : id(),
            verseId: mut.verseId,
            targetVerseId: mut.targetVerseId,
            surahId: s1,
            ayahId: a1,
            targetSurahId: s2,
            targetAyahId: a2,
            notes: mut.notes ?? '',
            status: mut.status ?? 'pending',
            createdAt: new Date().toISOString()
        };

        try {
            await updateInstantCustom(customItem);
            addToast('success', 'Custom mutashabih added');
            return true;
        } catch (error) {
            console.error('Failed to save custom mutashabih', error);
            await alert({
                title: 'Save Failed',
                message: 'Could not save custom similar verse. Please try again.',
            });
            return false;
        }
    };

    const handleDeleteCustomMutashabih = async (customId: string) => {
        const ok = await confirm({
            title: 'Delete Custom Mutashabih',
            message: 'Delete this custom mutashabih? This cannot be undone.',
            confirmLabel: 'Delete',
            isDestructive: true,
        });
        if (!ok) return;

        const isDecisionLinkedToCustom = (phraseId?: string) => {
            if (!phraseId) return false;
            return (
                phraseId === `custom-${customId}` ||
                phraseId.startsWith(`custom-${customId}-`) ||
                phraseId.endsWith(`-custom-${customId}`) ||
                phraseId.includes(`-custom-${customId}-`)
            );
        };
        const relatedDecisions = instantDecisions.filter(d => isDecisionLinkedToCustom(d.phraseId));
        const deletes = [
            db.tx.customMutashabihat[customId].delete(),
            ...relatedDecisions.map(d => db.tx.mutashabihatDecisions[d.id].delete())
        ];

        try {
            await db.transact(deletes);
        } catch (error) {
            console.error('Failed to delete custom mutashabih', error);
            await alert({
                title: 'Delete Failed',
                message: 'Could not delete custom similar verse. Please try again.',
            });
        }
    };

    const handleExport = async () => {
        // Use hook data for export
        const exportData = {
            version: 1,
            timestamp: new Date().toISOString(),
            settings,
            memoryNodes: instantNodes,
            decisions: instantDecisions,
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quran-app-instantdb-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                JSON.parse(event.target?.result as string);
                const ok = await confirm({
                    title: 'Confirm Import',
                    message: 'Importing will overwrite current progress. Continue?',
                    confirmLabel: 'Import',
                    isDestructive: true,
                });
                if (ok) {
                    // Implementation for InstantDB import would involve bulk transactions
                    // For now, let's warn that it's not fully implemented for InstantDB
                    await alert({
                        title: 'Import Not Available',
                        message: 'Import for InstantDB is not yet fully implemented. Please use cloud sync.',
                    });
                }
            } catch (err) {
                await alert({
                    title: 'Invalid Backup',
                    message: 'Invalid backup file',
                });
            }
        };
        reader.readAsText(file);
    };

    const collectSurahMutSourceGroups = (surahId: number) => {
        const sourceMap: Record<string, {
            phraseId: string;
            phraseIds: string[];
            ayahIds: number[];
            absRefs: number[];
            entries: any[];
            phraseAbsRefs: Record<string, number[]>;
            customIds: Set<string>;
        }> = {};

        getAllMutashabihatRefs(instantCustomMutashabihat)
            .filter(abs => absoluteToSurahAyah(abs).surahId === surahId)
            .forEach(abs => {
                const ref = absoluteToSurahAyah(abs);
                const muts = getMutashabihatForAbsolute(abs, instantCustomMutashabihat);
                muts.forEach(entry => {
                    const sourceAbs = Number((entry as any)?.meta?.sourceAbs);
                    const sourceRef = Number.isFinite(sourceAbs) ? absoluteToSurahAyah(sourceAbs) : null;
                    const sourceGroupKey = sourceRef && sourceRef.surahId === surahId
                        ? `source-${sourceAbs}`
                        : `phrase-${entry.phraseId}`;

                    if (!sourceMap[sourceGroupKey]) {
                        sourceMap[sourceGroupKey] = {
                            phraseId: entry.phraseId,
                            phraseIds: [],
                            ayahIds: [],
                            absRefs: [],
                            entries: [],
                            phraseAbsRefs: {},
                            customIds: new Set<string>(),
                        };
                    }

                    const current = sourceMap[sourceGroupKey];
                    if (!current.phraseIds.includes(entry.phraseId)) {
                        current.phraseIds.push(entry.phraseId);
                    }
                    const entryKey = `${entry?.phraseId || ''}-${Number((entry as any)?.meta?.sourceAbs) || 0}`;
                    if (!current.entries.some(existingEntry => `${existingEntry?.phraseId || ''}-${Number((existingEntry as any)?.meta?.sourceAbs) || 0}` === entryKey)) {
                        current.entries.push(entry);
                    }
                    if (!current.phraseAbsRefs[entry.phraseId]) {
                        current.phraseAbsRefs[entry.phraseId] = [];
                    }
                    if (!current.phraseAbsRefs[entry.phraseId].includes(abs)) {
                        current.phraseAbsRefs[entry.phraseId].push(abs);
                    }
                    if (!current.absRefs.includes(abs)) {
                        current.absRefs.push(abs);
                        current.ayahIds.push(ref.ayahId);
                    }

                    const customId = String((entry as any)?.meta?.customId || '');
                    if (customId) current.customIds.add(customId);
                });
            });

        const rawGroups = Object.values(sourceMap).map((group) => ({
            phraseId: group.phraseId,
            phraseIds: [...group.phraseIds],
            ayahIds: [...group.ayahIds],
            absRefs: [...group.absRefs],
            entries: [...group.entries],
            phraseAbsRefs: Object.fromEntries(
                Object.entries(group.phraseAbsRefs).map(([phraseId, refs]) => [phraseId, [...refs]])
            ),
            customIds: new Set(group.customIds),
        }));

        const getEntryRangesForAbs = (entry: any, absRef: number): Set<string> => {
            const ranges = new Set<string>();
            const meta: any = entry?.meta;
            if (!meta) return ranges;

            if (Number(meta.sourceAbs) === absRef && Array.isArray(meta.sourceRange) && meta.sourceRange.length === 2) {
                ranges.add(`${meta.sourceRange[0]}-${meta.sourceRange[1]}`);
            }

            const matches = Array.isArray(meta.matches) ? meta.matches : [];
            matches.forEach((match: any) => {
                if (Number(match?.absolute) !== absRef) return;
                if (!Array.isArray(match?.wordRange) || match.wordRange.length !== 2) return;
                ranges.add(`${match.wordRange[0]}-${match.wordRange[1]}`);
            });

            return ranges;
        };

        const getGroupRangesForAbs = (group: typeof rawGroups[number], absRef: number): Set<string> => {
            const ranges = new Set<string>();
            group.entries.forEach((entry: any) => {
                getEntryRangesForAbs(entry, absRef).forEach((range) => ranges.add(range));
            });
            return ranges;
        };

        const getGroupExternalMatches = (group: typeof rawGroups[number]): Set<number> => {
            const matches = new Set<number>();
            const localAbs = new Set(group.absRefs);
            group.entries.forEach((entry: any) => {
                const entryMatches = Array.isArray(entry?.matches) ? entry.matches : [];
                entryMatches.forEach((matchAbs: number) => {
                    if (!localAbs.has(matchAbs)) matches.add(matchAbs);
                });
            });
            return matches;
        };

        const rangesOverlap = (leftRange: string, rightRange: string): boolean => {
            const [lStartStr, lEndStr] = leftRange.split('-');
            const [rStartStr, rEndStr] = rightRange.split('-');
            const lStart = Number(lStartStr);
            const lEnd = Number(lEndStr);
            const rStart = Number(rStartStr);
            const rEnd = Number(rEndStr);
            if (![lStart, lEnd, rStart, rEnd].every(Number.isFinite)) return false;
            return Math.max(lStart, rStart) <= Math.min(lEnd, rEnd);
        };

        const sameMatchSet = (leftMatches: Set<number>, rightMatches: Set<number>): boolean => {
            if (leftMatches.size === 0 || rightMatches.size === 0) return false;
            if (leftMatches.size !== rightMatches.size) return false;
            return Array.from(leftMatches).every((value) => rightMatches.has(value));
        };

        const groupsShouldMerge = (left: typeof rawGroups[number], right: typeof rawGroups[number]) => {
            const sharedAbsRefs = left.absRefs.filter((absRef) => right.absRefs.includes(absRef));
            if (sharedAbsRefs.length === 0) return false;

            const leftExternalMatches = getGroupExternalMatches(left);
            const rightExternalMatches = getGroupExternalMatches(right);

            return sharedAbsRefs.some((absRef) => {
                const leftRanges = getGroupRangesForAbs(left, absRef);
                const rightRanges = getGroupRangesForAbs(right, absRef);
                if (leftRanges.size === 0 || rightRanges.size === 0) return false;

                const hasExactRangeMatch = Array.from(leftRanges).some((range) => rightRanges.has(range));
                if (hasExactRangeMatch) return true;

                const hasOverlappingRange = Array.from(leftRanges).some((leftRange) =>
                    Array.from(rightRanges).some((rightRange) => rangesOverlap(leftRange, rightRange))
                );
                if (!hasOverlappingRange) return false;

                return sameMatchSet(leftExternalMatches, rightExternalMatches);
            });
        };

        const mergeGroupData = (left: typeof rawGroups[number], right: typeof rawGroups[number]) => {
            const mergedPhraseAbsRefs: Record<string, number[]> = { ...left.phraseAbsRefs };
            Object.entries(right.phraseAbsRefs).forEach(([phraseId, refs]) => {
                mergedPhraseAbsRefs[phraseId] = Array.from(new Set([...(mergedPhraseAbsRefs[phraseId] || []), ...refs]));
            });

            const entriesByKey = new Map<string, any>();
            [...left.entries, ...right.entries].forEach((entry: any) => {
                const key = `${entry?.phraseId || ''}-${Number(entry?.meta?.sourceAbs) || 0}`;
                if (!entriesByKey.has(key)) entriesByKey.set(key, entry);
            });

            return {
                phraseId: left.phraseId,
                phraseIds: Array.from(new Set([...left.phraseIds, ...right.phraseIds])),
                ayahIds: Array.from(new Set([...left.ayahIds, ...right.ayahIds])),
                absRefs: Array.from(new Set([...left.absRefs, ...right.absRefs])),
                entries: Array.from(entriesByKey.values()),
                phraseAbsRefs: mergedPhraseAbsRefs,
                customIds: new Set([...left.customIds, ...right.customIds]),
            };
        };

        const mergedGroups: typeof rawGroups = [];
        rawGroups.forEach((group) => {
            let candidate = group;
            let didMerge = true;
            while (didMerge) {
                didMerge = false;
                for (let i = 0; i < mergedGroups.length; i += 1) {
                    if (groupsShouldMerge(mergedGroups[i], candidate)) {
                        candidate = mergeGroupData(mergedGroups[i], candidate);
                        mergedGroups.splice(i, 1);
                        didMerge = true;
                        break;
                    }
                }
            }
            mergedGroups.push(candidate);
        });

        return mergedGroups;
    };

    const mutashabihatBySurah = useMemo(() => {
        const map: Record<number, number> = {};
        getSurahsByPart(settings.activePart).forEach((surah) => {
            map[surah.id] = collectSurahMutSourceGroups(surah.id).length;
        });
        return map;
    }, [settings.activePart, instantCustomMutashabihat]);

    const mutashabihatSurahs = useMemo(() => {
        return getSurahsByPart(settings.activePart)
            .map(s => ({ surah: s, count: mutashabihatBySurah[s.id] || 0 }))
            .filter(entry => entry.count > 0);
    }, [settings.activePart, mutashabihatBySurah]);

    useEffect(() => {
        if (mutashabihatSurahs.length > 0 && !selectedMutSurah) {
            setSelectedMutSurah(mutashabihatSurahs[0].surah.id);
        } else if (mutashabihatSurahs.every(s => s.surah.id !== selectedMutSurah)) {
            setSelectedMutSurah(mutashabihatSurahs[0]?.surah.id ?? null);
        }
    }, [mutashabihatSurahs, selectedMutSurah]);

    const buildSurahMutGroups = (surahId: number): SimilaritySurahGroup[] => {
        return collectSurahMutSourceGroups(surahId)
            .map((group): SimilaritySurahGroup => {
                const resolutionTargets: SimilarityResolutionTarget[] = group.phraseIds.map((phraseId) => {
                    const phraseAbsRefs = group.phraseAbsRefs[phraseId] || group.absRefs;
                    const representativeAbs = phraseAbsRefs.find(a => decisions[`${a}-${phraseId}`]?.status !== 'pending') || phraseAbsRefs[0];
                    return {
                        phraseId,
                        representativeAbs,
                        decisionKey: `${representativeAbs}-${phraseId}`,
                    };
                });
                const primary = resolutionTargets.find(target => decisions[target.decisionKey]?.status !== 'pending') || resolutionTargets[0];
                const mergedMatches = Array.from(new Set(group.entries.flatMap((entry: any) => entry?.matches || [])))
                    .filter((matchAbs: number) => !group.absRefs.includes(matchAbs));

                return {
                    phraseId: primary?.phraseId || group.phraseId,
                    phraseIds: group.phraseIds,
                    ayahIds: group.ayahIds,
                    absRefs: group.absRefs,
                    entries: group.entries,
                    customIds: Array.from(group.customIds),
                    matchCount: mergedMatches.length,
                    decisionKey: primary?.decisionKey || `${group.absRefs[0]}-${group.phraseId}`,
                    representativeAbs: primary?.representativeAbs || group.absRefs[0],
                    resolutionTargets,
                };
            })
            .sort((a, b) => Math.min(...a.ayahIds) - Math.min(...b.ayahIds));
    };

    return (
        <>
            {settingsMindmapEditor && (
                <MindmapEditor
                    initialSnapshot={settingsMindmapEditor.snapshot}
                    onSave={handleSettingsEditorSave}
                    onClose={() => setSettingsMindmapEditor(null)}
                    title="Surah Mindmap Editor"
                    docLink={`/docs/mindmaps/surah-${settingsMindmapEditor.surahId}`}
                />
            )}
            {settingsSplitsSurahId !== null && (() => {
                const surahMeta = getSurah(settingsSplitsSurahId);
                if (!surahMeta) return null;
                const mm = settingsMindmapsBySurah[settingsSplitsSurahId];
                return (
                    <SplitsModal
                        isOpen={settingsSplitsSurahId !== null}
                        onClose={() => setSettingsSplitsSurahId(null)}
                        isMobile={isMobile}
                        surahId={settingsSplitsSurahId}
                        verseCount={surahMeta.verseCount}
                        builderState={getSettingsBuilderState(settingsSplitsSurahId)}
                        mindmapImageUrl={mm?.imageUrl || null}
                        mindmapImageUrlDark={mm?.imageUrlDark || null}
                        snapshot={mm?.tldrawSnapshot}
                        isDark={isDark}
                        onAddBreak={(val) => handleSettingsAddBreak(settingsSplitsSurahId, val)}
                        onRemoveBreak={(val) => handleSettingsRemoveBreak(settingsSplitsSurahId, val)}
                        onSave={() => handleSettingsSaveAnchors(settingsSplitsSurahId, surahMeta.verseCount)}
                        hasReviewedHistory={false}
                    />
                );
            })()}
            {isMobile ? renderMobileView() : (
                <div className="content-wrapper tab-content">
                    <div className="hidden md:flex items-center justify-between mb-6 settings-topbar-row">
                        <h1 className="text-2xl font-bold m-0">Settings</h1>
                        <div className="settings-support-cta">
                            <span>Need support or more details? Join our Discord server.</span>
                            <a
                                className="settings-support-discord-link"
                                href="https://discord.gg/6wy3YRG2qB"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Join Discord
                            </a>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="settings-grid">

                            <div className="card modern-card" style={{
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px'
                            }}>
                                <div className="section-title"
                                    onClick={() => toggleSection('cloudSync')}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        marginBottom: sectionsExpanded.cloudSync ? '1rem' : '0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        fontSize: 'clamp(1rem, 5vw, 1.1rem)',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div className="header-icon-badge">
                                            <Database size={18} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span>User Account</span>
                                        </div>
                                    </div>
                                    <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.cloudSync ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>

                                {sectionsExpanded.cloudSync && (
                                    <>
                                        <p style={{ marginBottom: '1rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>
                                            {user
                                                ? `Signed in as ${user.email}. Your data is synced automatically.`
                                                : "Sign in to sync your progress across devices."}
                                        </p>
                                        {user && renderBillingInfo()}

                                        <div style={{ opacity: isOnline ? 1 : 0.45, pointerEvents: isOnline ? 'auto' : 'none' }}>
                                            {!isOnline && (
                                                <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}>
                                                    <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Offline</div>
                                                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '0.85rem' }}>
                                                        Cloud sync and authentication are paused. Keep using the app; changes will sync when online.
                                                    </div>
                                                </div>
                                            )}

                                            {user ? (
                                                <>
                                                    {renderSignedInAccountActions()}
                                                </>
                                            ) : (
                                                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    {authStep === 'email' ? (
                                                        <input
                                                            type="email"
                                                            placeholder="Enter your email"
                                                            value={email}
                                                            onChange={(e) => setEmail(e.target.value)}
                                                            required
                                                            style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                                                        />
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            placeholder="Enter verification code"
                                                            value={code}
                                                            onChange={(e) => setCode(e.target.value)}
                                                            required
                                                            style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                                                        />
                                                    )}
                                                    {authError && <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>{authError}</p>}
                                                    <button
                                                        type="submit"
                                                        className="btn btn-primary"
                                                        disabled={isAuthProcessing}
                                                        style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}
                                                    >
                                                        {isAuthProcessing ? 'Delete & Stop Renewal' : (authStep === 'email' ? 'Send Code' : 'Verify Code')}
                                                    </button>

                                                    {authStep === 'email' && (
                                                        <>
                                                            <div style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0', gap: '0.75rem' }}>
                                                                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)' }}>or</span>
                                                                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                                                            </div>

                                                            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                                                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                                    <GoogleLogin
                                                                        nonce={googleNonce}
                                                                        theme="outline"
                                                                        shape="pill"
                                                                        size="large"
                                                                        width="100%"
                                                                        text="continue_with"
                                                                        onError={() => {
                                                                            console.error('Google login failed');
                                                                            setAuthError('Google login failed');
                                                                        }}
                                                                        onSuccess={({ credential }) => {
                                                                            if (!credential) return;
                                                                            setIsAuthProcessing(true);
                                                                            db.auth
                                                                                .signInWithIdToken({
                                                                                    clientName: GOOGLE_CLIENT_NAME,
                                                                                    idToken: credential,
                                                                                    nonce: googleNonce,
                                                                                })
                                                                                .catch((err) => {
                                                                                    console.error('InstantDB Google auth error:', err);
                                                                                    setAuthError('Uh oh: ' + (err.body?.message || err.message));
                                                                                })
                                                                                .finally(() => {
                                                                                    setIsAuthProcessing(false);
                                                                                });
                                                                        }}
                                                                    />
                                                                </div>
                                                            </GoogleOAuthProvider>
                                                        </>
                                                    )}
                                                </form>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            <AppearanceCard onSelectTheme={handleThemeSelect} onSelectAccentTheme={handleAccentThemeSelect} />
                            <div className="card modern-card" style={{
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px'
                            }}>
                                <div className="section-title"
                                    onClick={() => toggleSection('schedule')}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        marginBottom: sectionsExpanded.schedule ? '1rem' : '0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        fontSize: 'clamp(1rem, 5vw, 1.1rem)',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div className="header-icon-badge">
                                            <Clock size={18} />
                                        </div>
                                        <span>Completion Schedule</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        {sectionsExpanded.schedule && (
                                            <button
                                                className="bulk-btn reset-mut"
                                                onClick={(e) => { e.stopPropagation(); handleResetDailyPortion(); }}
                                                title="Reset daily portion progress for the active part"
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                                            >
                                                <RotateCcw size={14} /> <span className="hide-mobile">Reset Daily Portion</span><span className="show-mobile">Reset</span>
                                            </button>
                                        )}
                                        <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.schedule ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                    </div>
                                </div>
                                {sectionsExpanded.schedule && (
                                    <>
                                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                            Set how many days you want to complete one full cycle of your active part.
                                        </p>
                                        <DailyCompletionSlider
                                            days={completionDaysDraft}
                                            onChange={handleCompletionDays}
                                            activePart={settings.activePart}
                                        />
                                    </>
                                )}
                            </div>

                            <div className="card modern-card" style={{
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px'
                            }}>
                                <div className="section-title"
                                    onClick={() => toggleSection('activePart')}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        marginBottom: sectionsExpanded.activePart ? '1rem' : '0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        fontSize: 'clamp(1rem, 5vw, 1.1rem)',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div className="header-icon-badge">
                                            <Book size={18} />
                                        </div>
                                        <span>Active Part</span>
                                    </div>
                                    <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.activePart ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>
                                {sectionsExpanded.activePart && (
                                    <>
                                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                            Choose the part you are focusing on for your daily portion and todo flow.
                                        </p>
                                        <div className="part-selector" style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                                            gap: '0.75rem'
                                        }}>
                                            {ACTIVE_PART_OPTIONS.map(p => (
                                                <button
                                                    key={p.id}
                                                    className={`part-option ${settings.activePart === p.id ? 'active' : ''}`}
                                                    onClick={() => handleActivePart(p.id as QuranPart)}
                                                    style={{
                                                        padding: '1.25rem 0.75rem',
                                                        borderRadius: '16px',
                                                        transition: 'all 0.2s',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        textAlign: 'center',
                                                        gap: '0.25rem',
                                                    }}
                                                >
                                                    <div className="part-number" style={{ fontSize: '1.4rem', fontWeight: 800, color: settings.activePart === p.id ? 'var(--accent)' : 'var(--foreground-secondary)' }}>
                                                        {p.id === ALL_QURAN_PART ? '∞' : p.id}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: settings.activePart === p.id ? 'var(--accent)' : 'var(--foreground-secondary)' }}>{p.name}</div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--foreground-secondary)', opacity: 0.8 }}>{getSurahsByPart(p.id as QuranPart).length} surahs</div>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="card modern-card" style={{
                                padding: sectionsExpanded.surahStatus ? 'clamp(1rem, 4vw, 1.5rem)' : '1rem',
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px',
                                gridColumn: '1 / -1'
                            }}>
                                <div className="section-title"
                                    onClick={() => toggleSection('surahStatus')}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        marginBottom: sectionsExpanded.surahStatus ? '0.75rem' : '0',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div className="header-icon-badge">
                                            <PauseCircle size={18} />
                                        </div>
                                        <span style={{ fontSize: 'clamp(1rem, 5vw, 1.1rem)' }}>Skipped Surah</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.surahStatus ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                    </div>
                                </div>
                                {sectionsExpanded.surahStatus && (
                                    <>
                                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                            Manage surahs you want to skip from the daily review queue.
                                        </p>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                            <select
                                                value={surahToSkipId}
                                                onChange={(e) => setSurahToSkipId(e.target.value ? Number(e.target.value) : '')}
                                                style={{
                                                    flex: 1,
                                                    padding: '0.75rem',
                                                    borderRadius: '12px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--background)',
                                                    color: 'var(--foreground)',
                                                    fontSize: '0.9rem',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="">Select a surah to skip...</option>
                                                {SURAHS.filter(s => s.id !== LOCKED_SKIPPED_SURAH_ID).map(s => (
                                                    <option key={s.id} value={s.id} disabled={settings.skippedSurahs?.includes(s.id)}>
                                                        {s.id}. {s.name} ({s.arabicName})
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                className="std-normal-btn"
                                                onClick={handleAddSkippedSurah}
                                                disabled={!surahToSkipId}
                                                style={{
                                                    padding: '0 1.25rem',
                                                    borderRadius: '12px',
                                                    fontWeight: 600,
                                                    cursor: surahToSkipId ? 'pointer' : 'not-allowed',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                Add
                                            </button>
                                        </div>

                                        <div className="skipped-surahs-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {(!settings.skippedSurahs || settings.skippedSurahs.length === 0) && (
                                                <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem', fontStyle: 'italic', width: '100%' }}>No surahs skipped.</p>
                                            )}
                                            {settings.skippedSurahs?.map(id => {
                                                const s = SURAHS.find(surah => surah.id === id);
                                                if (!s) return null;
                                                return (
                                                    <div key={id} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        padding: '0.5rem 0.75rem',
                                                        background: 'var(--background)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '20px',
                                                        fontSize: '0.85rem'
                                                    }}>
                                                        <span>{s.id}. {s.name}</span>
                                                        {id === LOCKED_SKIPPED_SURAH_ID ? (
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)' }}>Always skipped</span>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleRemoveSkippedSurah(id)}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    padding: 0,
                                                                    color: 'var(--foreground-secondary)',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center'
                                                                }}
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>

                        </div>

                        <div style={{ marginTop: '1.5rem' }}>
                            <div className="card modern-card" style={{
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px'
                            }}>
                                <div className="section-title"
                                    onClick={() => {
                                        if (window.innerWidth < 768) {
                                            setShowDebugNodes(!showDebugNodes);
                                        }
                                    }}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: showDebugNodes ? '0rem' : '0',
                                        fontSize: 'clamp(1rem, 5vw, 1.1rem)'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div className="header-icon-badge">
                                            <Activity size={18} />
                                        </div>
                                        <span>Knowledge Tracking</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        {showDebugNodes && (
                                            isMobile ? (
                                                <select
                                                    className="maturity-select"
                                                    value={knowledgeFilter}
                                                    onChange={(e) => setKnowledgeFilter(e.target.value as any)}
                                                    style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                                                >
                                                    <option value="all">All</option>
                                                    <option value="overdue">Overdue</option>
                                                    <option value="today">Due Today</option>
                                                    <option value="upcoming">Upcoming</option>
                                                    <option value="not_due">Not Due</option>
                                                </select>
                                            ) : (
                                                <div className="segmented-compact segmented-compact--small" style={{ width: 'fit-content' }}>
                                                    {[
                                                        { id: 'all', label: 'ALL' },
                                                        { id: 'overdue', label: 'OVERDUE' },
                                                        { id: 'today', label: 'DUE TODAY' },
                                                        { id: 'upcoming', label: 'UPCOMING' },
                                                        { id: 'not_due', label: 'NOT DUE' }
                                                    ].map((f) => (
                                                        <button
                                                            key={f.id}
                                                            suppressHydrationWarning={true}
                                                            onClick={() => setKnowledgeFilter(f.id as any)}
                                                            className={`adv-seg-btn ${knowledgeFilter === f.id ? 'adv-seg-active' : ''}`}
                                                        >
                                                            {f.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )
                                        )}
                                        {showDebugNodes && hasExpandedKnowledgeItems && (
                                            <button
                                                className="bulk-btn reset-mut"
                                                data-tooltip-disabled="true"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    foldKnowledgeTrackingItems();
                                                }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                                            >
                                                <ChevronDown size={14} style={{ transform: 'rotate(180deg)' }} />
                                                <span className="hide-mobile">Fold All</span>
                                                <span className="show-mobile">Fold</span>
                                            </button>
                                        )}
                                        <ChevronDown className="md:hidden" size={20} style={{ transform: showDebugNodes ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                    </div>
                                </div>

                                {showDebugNodes && (
                                    <div style={{ marginTop: '1.5rem' }}>
                                        <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                            This section shows your review schedules.
                                        </p>

                                        {isMobile ? (
                                            <div className="knowledge-groups-mobile">
                                                {/* MINDMAPS MOBILE GROUP */}
                                                <div className="mobile-group-item">
                                                    <div className="mobile-group-header" onClick={() => toggleGroup('mindmaps')}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <MapIcon size={20} />
                                                            <span style={{ fontWeight: 600 }}>Mindmaps</span>
                                                        </div>
                                                        <ChevronDown size={20} style={{ transform: expandedGroups['mindmaps'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                    </div>
                                                    {expandedGroups['mindmaps'] && (
                                                        <div className="mobile-subgroup-list">
                                                            <div className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                                id: 'mindmaps-part',
                                                                title: 'Part Mindmaps',
                                                                type: 'part_mindmap' as any,
                                                                nodes: filteredPartMindmaps
                                                            })}>
                                                                <span>Part Mindmaps</span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span className="status-badge">{filteredPartMindmaps.length}</span>
                                                                    <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                                </div>
                                                            </div>
                                                            <div className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                                id: 'mindmaps-surah',
                                                                title: 'Surah Mindmaps',
                                                                type: 'mindmap' as any,
                                                                nodes: filteredSurahMindmaps
                                                            })}>
                                                                <span>Surah Mindmaps</span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span className="status-badge">{filteredSurahMindmaps.length}</span>
                                                                    <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* VERSES MOBILE GROUP */}
                                                <div className="mobile-group-item">
                                                    <div className="mobile-group-header" onClick={() => toggleGroup('verses')}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <Book size={20} />
                                                            <span style={{ fontWeight: 600 }}>Verses</span>
                                                        </div>
                                                        <ChevronDown size={20} style={{ transform: expandedGroups['verses'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                    </div>
                                                    {expandedGroups['verses'] && (
                                                        <div className="mobile-subgroup-list">
                                                            {/* Issue #10: Filter by active part */}
                                                            {(() => {
                                                                const learnedSurahs = settings.learnedVerses || {};
                                                                const filteredSurahs = SURAHS
                                                                    .filter(surah => {
                                                                        // Filter by active part (show all when "All Quran" is selected)
                                                                        if (settings.activePart !== ALL_QURAN_PART && surah.part !== settings.activePart) return false;
                                                                        // Only show learned surahs (have entries in learnedVerses)
                                                                      
                                                                        // Only show non-skipped surahs
                                                                        if (settings.skippedSurahs?.includes(surah.id)) return false;
                                                                        return true;
                                                                    })
                                                                    .map(surah => surah.id)
                                                                    .sort((a, b) => a - b);

                                                                if (filteredSurahs.length === 0) {
                                                                    return (
                                                                        <div className="empty-state" style={{ padding: '1rem' }}>No learned surahs in {activePartLabel}</div>
                                                                    );
                                                                }

                                                                const visibleSurahs = knowledgeFilter === 'all'
                                                                    ? filteredSurahs
                                                                    : filteredSurahs.filter(surahId =>
                                                                        filteredVerseSegments.some(n => n.type === 'verse_segment' && resolveNodeSurahId(n) === surahId)
                                                                    );

                                                                if (visibleSurahs.length === 0) {
                                                                    return (
                                                                        <div className="empty-state" style={{ padding: '1rem' }}>No items match this filter.</div>
                                                                    );
                                                                }

                                                                return visibleSurahs.map(surahId => {
                                                                    const surah = getSurah(surahId!);
                                                                    const surahNodes = knowledgeFilter === 'all'
                                                                        ? latestVerseSegments.filter(n => n.type === 'verse_segment' && resolveNodeSurahId(n) === surahId)
                                                                        : filteredVerseSegments.filter(n => n.type === 'verse_segment' && resolveNodeSurahId(n) === surahId);
                                                                    return (
                                                                        <div key={surahId} className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                                            id: `verse-surah-${surahId}`,
                                                                            title: `${surah?.id}. ${surah?.name}`,
                                                                            type: 'verse_segment',
                                                                            nodes: surahNodes,
                                                                            surahId
                                                                        })}>
                                                                            <span>{surah?.name}</span>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="settings-sticky-table-wrap" style={{ margin: '0', padding: '0', width: '100%', maxWidth: '100%', borderRadius: '12px' }}>
                                                <table className="debug-table settings-sticky-header-table" style={{ minWidth: '700px', width: '100%', tableLayout:'fixed'}}>
                                                    <thead>
                                                        <tr>
                                                            <th>Target / Range</th>
                                                            <th>Maturity</th>
                                                            <th>Interval</th>
                                                            <th>Difficulty</th>
                                                            <th>Reps</th>
                                                            <th>Next Review</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {/* MINDMAPS GROUP */}
                                                        <tr className="group-header" onClick={() => toggleGroup('mindmaps')}>
                                                            <td colSpan={6} style={{ fontWeight: 700 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <ChevronDown size={16} style={{ transform: expandedGroups['mindmaps'] ? 'rotate(180deg)' : 'none' }} />
                                                                        <MapIcon size={16} /> Mindmaps
                                                                    </div>
                                                                    <select
                                                                        className="maturity-select"
                                                                        style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                                                        value=""
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        onChange={async (e) => {
                                                                            const val = e.target.value as any;
                                                                            if (!val) return;
                                                                            await handleGroupMaturityReset('mindmap', val);
                                                                            await handleGroupMaturityReset('part_mindmap', val);
                                                                        }}
                                                                    >
                                                                        <option value="">Set Group...</option>
                                                                        <option value="reset">Reset</option>
                                                                        <option value="medium">Medium</option>
                                                                        <option value="strong">Strong</option>
                                                                        <option value="mastered">Mastered</option>
                                                                    </select>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {expandedGroups['mindmaps'] && (
                                                            <>
                                                                {/* Part Mindmaps Subgroup */}
                                                                <tr className="subgroup-header" onClick={() => toggleGroup('mindmaps-part')}>
                                                                    <td colSpan={6} style={{ fontWeight: 600 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                <ChevronDown size={14} style={{ transform: expandedGroups['mindmaps-part'] ? 'rotate(180deg)' : 'none' }} />
                                                                                Part Mindmaps
                                                                            </div>
                                                                            <select
                                                                                className="maturity-select"
                                                                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                                                                value=""
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                onChange={async (e) => {
                                                                                    const val = e.target.value as any;
                                                                                    if (!val) return;
                                                                                    await handleGroupMaturityReset('part_mindmap', val);
                                                                                }}
                                                                            >
                                                                                <option value="">Set Subgroup...</option>
                                                                                <option value="reset">Reset</option>
                                                                                <option value="medium">Medium</option>
                                                                                <option value="strong">Strong</option>
                                                                                <option value="mastered">Mastered</option>
                                                                            </select>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {expandedGroups['mindmaps-part'] && (
                                                                    filteredPartMindmaps.length > 0 ? (
                                                                        filteredPartMindmaps
                                                                            .sort((a, b) => (resolveNodePartId(a) || 0) - (resolveNodePartId(b) || 0))
                                                                            .map(node => {
                                                                                const due = getNodeDueDate(node);
                                                                                const isOverdue = (due || '') <= new Date().toISOString().split('T')[0];
                                                                                const partId = resolveNodePartId(node);
                                                                                return (
                                                                                <tr key={node.id} className="node-row">
                                                                                    <td>Part {partId ?? '-'}</td>
                                                                                    <td>
                                                                                        <select
                                                                                            value=""
                                                                                            onChange={async (e) => {
                                                                                                if (!e.target.value) return;
                                                                                                await handleNodeMaturityReset(node.id, e.target.value as any);
                                                                                            }}
                                                                                            className="maturity-select"
                                                                                        >
                                                                                            <option value="">Set To...</option>
                                                                                            <option value="reset">Reset</option>
                                                                                            <option value="medium">Medium</option>
                                                                                            <option value="strong">Strong</option>
                                                                                            <option value="mastered">Mastered</option>
                                                                                        </select>
                                                                                    </td>
                                                                                    <td>{formatKnowledgeTrackingInterval(getNodeStability(node))}</td>
                                                                                    <td>{formatKnowledgeTrackingDifficulty(getNodeDifficulty(node))}</td>
                                                                                    <td>{getNodeReps(node)}</td>
                                                                                    <td className={isOverdue ? 'status-overdue' : ''}>{formatKnowledgeTrackingDueDate(due)}</td>
                                                                                </tr>
                                                                            );
                                                                            })
                                                                    ) : (
                                                                        <tr className="node-row"><td colSpan={6} style={{ fontStyle: 'italic', opacity: 0.5 }}>No part mindmaps</td></tr>
                                                                    )
                                                                )}

                                                                {/* Surah Mindmaps Subgroup */}
                                                                <tr className="subgroup-header" onClick={() => toggleGroup('mindmaps-surah')}>
                                                                    <td colSpan={6} style={{ fontWeight: 600 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                <ChevronDown size={14} style={{ transform: expandedGroups['mindmaps-surah'] ? 'rotate(180deg)' : 'none' }} />
                                                                                Surah Mindmaps
                                                                            </div>
                                                                            <select
                                                                                className="maturity-select"
                                                                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                                                                value=""
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                onChange={async (e) => {
                                                                                    const val = e.target.value as any;
                                                                                    if (!val) return;
                                                                                    await handleGroupMaturityReset('mindmap', val);
                                                                                }}
                                                                            >
                                                                                <option value="">Set Subgroup...</option>
                                                                                <option value="reset">Reset</option>
                                                                                <option value="medium">Medium</option>
                                                                                <option value="strong">Strong</option>
                                                                                <option value="mastered">Mastered</option>
                                                                            </select>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {expandedGroups['mindmaps-surah'] && (
                                                                    filteredSurahMindmaps.length > 0 ? (
                                                                        filteredSurahMindmaps
                                                                            .sort((a, b) => (resolveNodeSurahId(a) || 0) - (resolveNodeSurahId(b) || 0))
                                                                            .map(node => {
                                                                                const due = getNodeDueDate(node);
                                                                                const isOverdue = (due || '') <= new Date().toISOString().split('T')[0];
                                                                                const surahId = resolveNodeSurahId(node);
                                                                                return (
                                                                                <tr key={node.id} className="node-row">
                                                                                    <td>{surahId ? `${surahId}. ${getSurah(surahId)?.name}` : '-'}</td>
                                                                                    <td>
                                                                                        <select
                                                                                            value=""
                                                                                            onChange={async (e) => {
                                                                                                if (!e.target.value) return;
                                                                                                await handleNodeMaturityReset(node.id, e.target.value as any);
                                                                                            }}
                                                                                            className="maturity-select"
                                                                                        >
                                                                                            <option value="">Set To...</option>
                                                                                            <option value="reset">Reset</option>
                                                                                            <option value="medium">Medium</option>
                                                                                            <option value="strong">Strong</option>
                                                                                            <option value="mastered">Mastered</option>
                                                                                        </select>
                                                                                    </td>
                                                                                    <td>{formatKnowledgeTrackingInterval(getNodeStability(node))}</td>
                                                                                    <td>{formatKnowledgeTrackingDifficulty(getNodeDifficulty(node))}</td>
                                                                                    <td>{getNodeReps(node)}</td>
                                                                                    <td className={isOverdue ? 'status-overdue' : ''}>{formatKnowledgeTrackingDueDate(due)}</td>
                                                                                </tr>
                                                                            );
                                                                            })
                                                                    ) : (
                                                                        <tr className="node-row"><td colSpan={6} style={{ fontStyle: 'italic', opacity: 0.5 }}>No surah mindmaps</td></tr>
                                                                    )
                                                                )}
                                                            </>
                                                        )}

                                                        {/* VERSES GROUP */}
                                                        <tr className="group-header" onClick={() => toggleGroup('verses')}>
                                                            <td colSpan={6} style={{ fontWeight: 700 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <ChevronDown size={16} style={{ transform: expandedGroups['verses'] ? 'rotate(180deg)' : 'none' }} />
                                                                        <Book size={16} /> Verses
                                                                    </div>
                                                                    <select
                                                                        className="maturity-select"
                                                                        style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                                                        value=""
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        onChange={async (e) => {
                                                                            const val = e.target.value as any;
                                                                            if (!val) return;
                                                                            await handleGroupMaturityReset('verse', val);
                                                                        }}
                                                                    >
                                                                        <option value="">Set Group...</option>
                                                                        <option value="reset">Reset</option>
                                                                        <option value="medium">Medium</option>
                                                                        <option value="strong">Strong</option>
                                                                        <option value="mastered">Mastered</option>
                                                                    </select>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {expandedGroups['verses'] && (
                                                            <>
                                                                {/* Issue #10: Filter by active part, show only learned surahs */}
                                                                {(() => {
                                                                    const learnedSurahs = settings.learnedVerses || {};
                                                                    const filteredSurahs = SURAHS
                                                                        .filter(surah => {
                                                                            // Filter by active part (show all when "All Quran" is selected)
                                                                            if (settings.activePart !== ALL_QURAN_PART && surah.part !== settings.activePart) return false;
                                                                            // Only show learned surahs (have entries in learnedVerses)
                                                                           
                                                                            // Only show non-skipped surahs
                                                                            if (settings.skippedSurahs?.includes(surah.id)) return false;
                                                                            return true;
                                                                        })
                                                                        .map(surah => surah.id)
                                                                        .sort((a, b) => a - b);

                                                                    if (filteredSurahs.length === 0) {
                                                                        return (
                                                                            <tr className="node-row"><td colSpan={6} style={{ fontStyle: 'italic', opacity: 0.5, paddingLeft: '2rem' }}>No learned surahs in {activePartLabel}</td></tr>
                                                                        );
                                                                    }

                                                                    const visibleSurahs = knowledgeFilter === 'all'
                                                                        ? filteredSurahs
                                                                        : filteredSurahs.filter(surahId =>
                                                                            filteredVerseSegments.some(n => n.type === 'verse_segment' && resolveNodeSurahId(n) === surahId)
                                                                        );

                                                                    if (visibleSurahs.length === 0) {
                                                                        return (
                                                                            <tr className="node-row"><td colSpan={6} style={{ fontStyle: 'italic', opacity: 0.5, paddingLeft: '2rem' }}>No items match this filter.</td></tr>
                                                                        );
                                                                    }

                                                                    return visibleSurahs.map(surahId => {
                                                                        const surah = getSurah(surahId!);
                                                                        const surahKey = `verse-surah-${surahId}`;
                                                                        const surahNodes = (knowledgeFilter === 'all' ? latestVerseSegments : filteredVerseSegments)
                                                                            .filter(n => n.type === 'verse_segment' && resolveNodeSurahId(n) === surahId)
                                                                            .sort((a, b) => (a.startVerse || 0) - (b.startVerse || 0));

                                                                        return (
                                                                            <React.Fragment key={surahId}>
                                                                                <tr className="subgroup-header" onClick={() => toggleGroup(surahKey)}>
                                                                                    <td colSpan={6} style={{ fontWeight: 600 }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                                <ChevronDown size={14} style={{ transform: expandedGroups[surahKey] ? 'rotate(180deg)' : 'none' }} />
                                                                                                {surah?.id}. {surah?.name}
                                                                                            </div>
                                                                                            {/* Issue #3: Bulk maturity controls per surah */}
                                                                                            <select
                                                                                                className="maturity-select"
                                                                                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                                                                                value=""
                                                                                                onClick={(e) => e.stopPropagation()}
                                                                                                onChange={async (e) => {
                                                                                                    const val = e.target.value as any;
                                                                                                    if (!val) return;
                                                                                                    await handleGroupMaturityReset('verse', val, surahId!, surah?.name);
                                                                                                    e.target.value = '';
                                                                                                }}
                                                                                            >
                                                                                                <option value="">Set Subgroup...</option>
                                                                                                <option value="reset">Reset</option>
                                                                                                <option value="medium">Medium</option>
                                                                                                <option value="strong">Strong</option>
                                                                                                <option value="mastered">Mastered</option>
                                                                                            </select>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                                {expandedGroups[surahKey] && surahNodes.map(node => {
                                                                                    const due = getNodeDueDate(node);
                                                                                    const isOverdue = (due || '') <= new Date().toISOString().split('T')[0];
                                                                                    return (
                                                                                    <tr key={node.id} className="node-row">
                                                                                        <td>Ayat {node.startVerse}-{node.endVerse}</td>
                                                                                        <td>
                                                                                            <select
                                                                                                value=""
                                                                                                onChange={async (e) => {
                                                                                                    await handleNodeMaturityReset(node.id, e.target.value as any);
                                                                                                }}
                                                                                                className="maturity-select"
                                                                                            >
                                                                                                <option value="">Set To...</option>
                                                                                                <option value="reset">Reset</option>
                                                                                                <option value="medium">Medium</option>
                                                                                                <option value="strong">Strong</option>
                                                                                                <option value="mastered">Mastered</option>
                                                                                            </select>
                                                                                        </td>
                                                                                        <td>{formatKnowledgeTrackingInterval(getNodeStability(node))}</td>
                                                                                        <td>{formatKnowledgeTrackingDifficulty(getNodeDifficulty(node))}</td>
                                                                                        <td>{getNodeReps(node)}</td>
                                                                                        <td className={isOverdue ? 'status-overdue' : ''}>{formatKnowledgeTrackingDueDate(due)}</td>
                                                                                    </tr>
                                                                                );
                                                                                })}
                                                                            </React.Fragment>
                                                                        );
                                                                    });
                                                                })()}
                                                            </>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card modern-card" style={{
                            marginTop: '1.5rem',
                            background: 'var(--background-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '16px',
                            padding: sectionsExpanded.mutashabihat ? 'clamp(1rem, 4vw, 1.5rem)' : '1rem'
                        }}>
                            <div className="section-title mut-header"
                                onClick={() => toggleSection('mutashabihat')}
                                style={{
                                    color: 'var(--accent)',
                                    fontWeight: 700,
                                    borderBottom: sectionsExpanded.mutashabihat ? '1px' : 'none',
                                    paddingBottom: sectionsExpanded.mutashabihat ? '1rem' : '0',
                                    marginBottom: sectionsExpanded.mutashabihat ? '1.25rem' : '0',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    cursor: 'pointer'
                                }}>
                                <div className="header-icon-badge">
                                    <Brain size={18} />
                                </div>
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flex: 1,
                                    gap: '0.75rem'
                                }}>
                                    <span style={{ fontSize: 'clamp(1rem, 4vw, 1.1rem)' }}>Similar Verse Coverage</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        {sectionsExpanded.mutashabihat && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                <button
                                                    className="bulk-btn learned"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setTargetSurahId(undefined);
                                                        setIsAddModalOpen(true);
                                                    }}
                                                    title="Add Custom Mutashabih"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                                                >
                                                    <Plus size={14} /> <span className="hide-mobile">Add Custom</span><span className="show-mobile">Add</span>
                                                </button>
                                                <button
                                                    className="bulk-btn reset-mut"
                                                    onClick={(e) => { e.stopPropagation(); handleResetMutashabihat(); }}
                                                    title="Reset all mutashabihat decisions for this part"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                                                >
                                                    <RotateCcw size={14} /> <span className="hide-mobile">Reset Decisions</span><span className="show-mobile">Reset</span>
                                                </button>
                                                {hasExpandedSimilarVerseItems && (
                                                    <button
                                                        className="bulk-btn reset-mut"
                                                        data-tooltip-disabled="true"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            foldSimilarVerseItems();
                                                        }}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                                                    >
                                                        <ChevronDown size={14} style={{ transform: 'rotate(180deg)' }} />
                                                        <span className="hide-mobile">Fold All</span><span className="show-mobile">Fold</span>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.mutashabihat ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                    </div>
                                </div>
                            </div>
                            {sectionsExpanded.mutashabihat && (
                                <div style={{ marginTop: '0.05rem' }}>
                                    <p className="mut-subheader" style={{ color: 'var(--foreground-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
                                        Surahs with similar verses in this part. Tap to expand and annotate similar ayat.
                                    </p>

                                    {isMobile ? (
                                        <div className="knowledge-groups-mobile">
                                            {mutashabihatSurahs.map(({ surah, count }) => {
                                                const isOpen = expandedSurahs[surah.id] ?? false;

                                                const groups = buildSurahMutGroups(surah.id);

                                                return (
                                                    <div key={surah.id} className="mobile-group-item">
                                                        <div className="mobile-group-header" onClick={() => setExpandedSurahs(prev => ({ ...prev, [surah.id]: !isOpen }))}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                <span style={{
                                                                    width: '24px', height: '24px', borderRadius: '6px',
                                                                    background: 'var(--accent)', color: 'white',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    fontSize: '0.75rem', fontWeight: 700
                                                                }}>{surah.id}</span>
                                                                <span style={{ fontWeight: 600 }}>{surah.name}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span className="status-badge" style={{ background: 'var(--accent-light)', color: 'white' }}>{count}</span>
                                                                <ChevronDown size={20} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                            </div>
                                                        </div>
                                                        {isOpen && (
                                                            <div className="mobile-subgroup-list">
                                                                {groups.map(group => {
                                                                    const representativeAbs = group.representativeAbs;
                                                                    const decisionKey = group.decisionKey;
                                                                    const existing = decisions[decisionKey] || { status: 'pending', notes: '' };
                                                                    const isConfirmed = group.resolutionTargets.some(target => !!decisions[target.decisionKey]?.confirmedAt);
                                                                    const isCustom = group.phraseIds.length === 1 && group.phraseIds[0].startsWith('custom-');

                                                                    return (
                                                                        <div key={decisionKey} className="mobile-subgroup-item" onClick={() => setActiveMutSlideOver({
                                                                            id: decisionKey,
                                                                            title: `${surah.name} - Ayah ${group.ayahIds.join(', ')}`,
                                                                            surahId: surah.id,
                                                                            phraseId: group.phraseId,
                                                                            group,
                                                                            representativeAbs
                                                                        })}>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                                                                    {group.ayahIds.length > 1 ? `Ayat ${group.ayahIds.sort((a, b) => a - b).join(', ')}` : `Ayah ${group.ayahIds[0]}`}
                                                                                </span>
                                                                                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                                                                                    {group.matchCount} matches
                                                                                </span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                {isConfirmed && <Check size={16} style={{ color: '#22c55e' }} />}
                                                                                <span className={`status-badge ${existing.status !== 'pending' ? 'active' : ''}`} style={{
                                                                                    fontSize: '0.65rem',
                                                                                    background: existing.status === 'pending' ? 'var(--border)' : 'var(--accent)',
                                                                                    color: 'white'
                                                                                }}>
                                                                                    {MUT_STATES.find(s => s.value === existing.status)?.label.split(' ')[0]}
                                                                                </span>
                                                                                {isCustom && <Trash2 size={14} style={{ opacity: 0.7 }} />}
                                                                                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="settings-sticky-table-wrap" style={{ margin: '0', padding: '0', width: '100%', maxWidth: '100%', borderRadius: '12px' }}>
                                            <table className="debug-table mutashabihat-table settings-sticky-header-table" style={{ minWidth: '700px', width: '100%' , tableLayout:'fixed'}}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '50px' }}></th>
                                                        <th>Ayah Number</th>
                                                        <th>Matches</th>
                                                        <th>Status</th>
                                                        <th>Actions</th>
                                                        <th>Note</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {mutashabihatSurahs.map(({ surah, count }) => {
                                                        const isOpen = expandedSurahs[surah.id] ?? false;
                                                        return (
                                                            <React.Fragment key={surah.id}>
                                                                <tr className="subgroup-header" onClick={() => setExpandedSurahs(prev => ({ ...prev, [surah.id]: !isOpen }))}>
                                                                    <td colSpan={6} style={{ fontWeight: 600 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                                                                                {surah.id}. {surah.name} ({count})
                                                                            </div>
                                                                            <span className="status-badge entries-badge" style={{ margin: 0 }}>{count} entries</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {isOpen && (() => {
                                                                    const groups = buildSurahMutGroups(surah.id);
                                                                    return groups.map(group => {
                                                                            const representativeAbs = group.representativeAbs;
                                                                            const decisionKey = group.decisionKey;
                                                                            const existing = decisions[decisionKey] || { status: 'pending', notes: '' };
                                                                            const isConfirmed = group.resolutionTargets.some(target => !!decisions[target.decisionKey]?.confirmedAt);
                                                                            const isDetailExpanded = expandedMutItems[decisionKey] || false;
                                                                            const isCustom = group.phraseIds.length === 1 && group.phraseIds[0].startsWith('custom-');
                                                                            const customId = isCustom ? group.customIds[0] : undefined;
                                                                            const toggleExpand = () => setExpandedMutItems(prev => ({ ...prev, [decisionKey]: !isDetailExpanded }));

                                                                            return (
                                                                                <React.Fragment key={decisionKey}>
                                                                                    <tr
                                                                                        className="node-row"
                                                                                        onClick={toggleExpand}
                                                                                        style={{ cursor: 'pointer' }}
                                                                                    >
                                                                                        <td style={{ paddingLeft: '1.5rem', width: '50px' }}>
                                                                                            <button
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    toggleExpand();
                                                                                                }}
                                                                                                style={{
                                                                                                    padding: 0,
                                                                                                    border: 'none',
                                                                                                    background: 'transparent',
                                                                                                    color: 'inherit',
                                                                                                    display: 'inline-flex',
                                                                                                    alignItems: 'center',
                                                                                                    cursor: 'pointer'
                                                                                                }}
                                                                                            >
                                                                                                <ChevronDown size={14} style={{ transform: isDetailExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                                                            </button>
                                                                                        </td>
                                                                                        <td>
                                                                                            <div style={{ fontWeight: 500 }}>
                                                                                                {group.ayahIds.length > 1 ? `Ayat ${group.ayahIds.sort((a, b) => a - b).join(', ')}` : `Ayah ${group.ayahIds[0]}`}
                                                                                            </div>
                                                                                            {isCustom && (
                                                                                                <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                                                                                                    Custom
                                                                                                </div>
                                                                                            )}
                                                                                        </td>
                                                                                        <td>{group.matchCount} matches</td>
                                                                                        <td>
                                                                                            <select
                                                                                                value={existing.status}
                                                                                                onClick={(e) => e.stopPropagation()}
                                                                                                onChange={e => applyDecisionToTargets(group.resolutionTargets, targetExisting => ({ ...targetExisting, status: e.target.value as any }))}
                                                                                                className="maturity-select"
                                                                                                style={{
                                                                                                    borderColor: existing.status !== 'pending' ? 'var(--accent)' : 'var(--border)',
                                                                                                    color: existing.status !== 'pending' ? 'var(--accent)' : 'inherit'
                                                                                                }}
                                                                                            >
                                                                                                {MUT_STATES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                                                            </select>
                                                                                        </td>
                                                                                        <td>
                                                                                            <button
    className={`bulk-btn std-normal-btn mutashabihat-resolve-btn ${isConfirmed ? 'learned' : ''}`}
    data-tooltip-disabled="true"
    onClick={(e) => {
        e.stopPropagation();
        applyDecisionToTargets(group.resolutionTargets, targetExisting => {
            if (isConfirmed) return { ...targetExisting, confirmedAt: undefined, status: 'pending' as const };
            return { ...targetExisting, confirmedAt: new Date().toISOString() };
        });
    }}
    style={{ minWidth: '100px' }}
>
    {isConfirmed ? 'Resolved' : 'Not Resolved'}
</button>
   
                                                                                        </td>
                                                                                        <td>
                                                                                            <div className="mutashabihat-note-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                                                                                {isCustom && customId && (
                                                                                                    <button
                                                                                                        className="bulk-btn reset-mut"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            handleDeleteCustomMutashabih(customId);
                                                                                                        }}
                                                                                                        title="Delete"
                                                                                                       style={{
                                                                                                            padding: '4px 10px',
                                                                                                            display: 'inline-flex',
                                                                                                            alignItems: 'center',
                                                                                                            justifyContent: 'center'
                                                                                                        }}
                                                                                                    >
                                                                                                        <Trash2 size={14} />
                                                                                                    </button>
                                                                                                )}
                                                                                                <button
                                                                                                    className="bulk-btn std-normal-btn mutashabihat-note-btn"
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        setNoteModal({
                                                                                                            decisionKey,
                                                                                                            representativeAbs,
                                                                                                            resolutionTargets: group.resolutionTargets,
                                                                                                            title: `${surah.name} - Ayah ${group.ayahIds.join(', ')}`,
                                                                                                            initialNote: existing.notes || ''
                                                                                                        });
                                                                                                    }}
                                                                                                    style={{ minWidth: '110px' }}
                                                                                                >
                                                                                                    {existing.notes ? 'Edit Note' : 'Add Note'}
                                                                                                </button>
                                                                                            </div>
                                                                                        </td>
                                                                                    </tr>
                                                                                    {isDetailExpanded && (
                                                                                        <tr>
                                                                                            <td colSpan={6} style={{ background: 'var(--verse-bg)', padding: '1.5rem', borderRadius: '0 0 8px 8px', maxWidth:'0', overflow:'hidden' }}>
                                                                                                <div className={`mut-context-block mut-detail-panel ${isConfirmed ? 'confirmed' : ''}`} style={{ margin: 0, border: 'none', background: 'transparent' }}>
                                                                                                    <div className="mut-text mut-detail-source">
                                                                                                        <div className="mut-text-label mut-detail-label" style={{ marginBottom: '0.75rem' }}>
                                                                                                            Surah {surah.name} - {group.ayahIds.join(', ')}
                                                                                                        </div>
                                                                                                        <div className="mut-context mut-verse-stack">
                                                                                                            {group.absRefs.map(absRef => {
                                                                                                                const displayedAbs = settingsContextVerseCursor[absRef] ?? absRef;
                                                                                                                const ref = absoluteToSurahAyah(displayedAbs);
                                                                                                                const baseVerse = getVerseByRef(ref.surahId, ref.ayahId);
                                                                                                                const mutEntry = group.entries.find(m => (m?.meta?.sourceAbs === absRef) || (m?.matches || []).includes(absRef));
                                                                                                                if (!mutEntry || !baseVerse) return null;

                                                                                                                return (
                                                                                                                    <div key={absRef} className="mut-verse-card" style={{ marginBottom: group.absRefs.length > 1 ? '0.75rem' : 0 }}>
                                                                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', direction: 'ltr', gap: '0.4rem', marginBottom: '0.6rem' }}>
                                                                                                                            <button
                                                                                                                                className="bulk-btn std-normal-btn"
                                                                                                                                onClick={() => openMindmapFromMutContext(ref.surahId)}
                                                                                                                                title="Mindmap Editor"
                                                                                                                                aria-label="Mindmap Editor"
                                                                                                                                style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                                                                            >
                                                                                                                                <PenTool size={14} />
                                                                                                                            </button>
                                                                                                                            <button
                                                                                                                                className="bulk-btn std-normal-btn"
                                                                                                                                onClick={() => openSplitsFromMutContext(ref.surahId)}
                                                                                                                                title="Splits Configuration"
                                                                                                                                aria-label="Splits Configuration"
                                                                                                                                style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                                                                            >
                                                                                                                                <SplitSquareHorizontal size={14} />
                                                                                                                            </button>
                                                                                                                            <button
                                                                                                                                className="bulk-btn std-normal-btn"
                                                                                                                                onClick={() => shiftSettingsContextVerse(absRef, 'after')}
                                                                                                                                title="Next Verse"
                                                                                                                                aria-label="Next Verse"
                                                                                                                                style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                                                                            >
                                                                                                                                <ChevronLeft size={14} />
                                                                                                                            </button>
                                                                                                                            <button
                                                                                                                                className="bulk-btn std-normal-btn"
                                                                                                                                onClick={() => shiftSettingsContextVerse(absRef, 'before')}
                                                                                                                                title="Previous Verse"
                                                                                                                                aria-label="Previous Verse"
                                                                                                                                style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                                                                            >
                                                                                                                                <ChevronRight size={14} />
                                                                                                                            </button>
                                                                                                                            <button
                                                                                                                                className="bulk-btn std-normal-btn"
                                                                                                                                onClick={() => resetSettingsContextVerse(absRef)}
                                                                                                                                title="Reset To Origin Verse"
                                                                                                                                aria-label="Reset To Origin Verse"
                                                                                                                                style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                                                                            >
                                                                                                                                <RotateCcw size={14} />
                                                                                                                            </button>
                                                                                                                        </div>
                                                                                                                        <p className="arabic-text mut-core" style={{ fontSize: '1.1rem', margin: 0 }}>
                                                                                                                            {group.absRefs.length > 1 && (
                                                                                                                                <span className="verse-badge mut-detail-ayah-badge">{ref.ayahId}</span>
                                                                                                                            )}
                                                                                                                            <HighlightedVerse
                                                                                                                                text={baseVerse.text}
                                                                                                                                range={mutEntry.meta.sourceAbs === displayedAbs ? mutEntry.meta.sourceRange : mutEntry.meta.matches.find((m: any) => m.absolute === displayedAbs)?.wordRange}
                                                                                                                            />
                                                                                                                        </p>
                                                                                                                    </div>
                                                                                                                );
                                                                                                            })}
                                                                                                        </div>
                                                                                                    </div>

                                                                                                    <div className="mut-matches mut-compare-list" style={{ marginTop: '1.25rem' }}>
                                                                                                        {(() => {
                                                                                                            const matchRangeByAbs = new Map<number, [number, number]>();
                                                                                                            group.entries.forEach((mutEntry: any) => {
                                                                                                                (mutEntry?.meta?.matches || []).forEach((m: any) => {
                                                                                                                    if (!matchRangeByAbs.has(m.absolute)) {
                                                                                                                        matchRangeByAbs.set(m.absolute, m.wordRange);
                                                                                                                    }
                                                                                                                });
                                                                                                            });
                                                                                                            const matches = Array.from(new Set(group.entries.flatMap((mutEntry: any) => mutEntry?.matches || []))).filter((matchAbs: number) => {
                                                                                                                if (group.absRefs.includes(matchAbs)) return false;
                                                                                                                const matchRef = absoluteToSurahAyah(matchAbs);
                                                                                                                return matchRef.surahId !== surah.id;
                                                                                                            });
                                                                                                            const isExpanded = expandedMutItems[`${decisionKey}-full`] || false;
                                                                                                            const visibleMatches = isExpanded ? matches : matches.slice(0, 4);
                                                                                                            const hasMore = matches.length > 4;

                                                                                                            return (
                                                                                                                <>
                                                                                                                    {visibleMatches.map((matchAbs: number, idx: number) => {
                                                                                                                        const displayedMatchAbs = settingsContextVerseCursor[matchAbs] ?? matchAbs;
                                                                                                                        const mref = absoluteToSurahAyah(displayedMatchAbs);
                                                                                                                        const msurah = getSurah(mref.surahId);
                                                                                                                        const mVerse = getVerseByRef(mref.surahId, mref.ayahId);
                                                                                                                        const matchRange = matchRangeByAbs.get(displayedMatchAbs);

                                                                                                                        return (
                                                                                                                            <div key={`${decisionKey}-match-${idx}`} className="mut-text mut-compare-card">
                                                                                                                                <div className="mut-text-label mut-compare-label">
                                                                                                                                    Compare: Surah {msurah?.name} - {mref.ayahId}
                                                                                                                                </div>
                                                                                                                                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', direction: 'ltr', gap: '0.4rem', marginBottom: '0.6rem' }}>
                                                                                                                                    <button
                                                                                                                                        className="bulk-btn std-normal-btn"
                                                                                                                                        onClick={() => openMindmapFromMutContext(mref.surahId)}
                                                                                                                                        title="Mindmap Editor"
                                                                                                                                        aria-label="Mindmap Editor"
                                                                                                                                        style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                                                                                    >
                                                                                                                                        <PenTool size={14} />
                                                                                                                                    </button>
                                                                                                                                    <button
                                                                                                                                        className="bulk-btn std-normal-btn"
                                                                                                                                        onClick={() => openSplitsFromMutContext(mref.surahId)}
                                                                                                                                        title="Splits Configuration"
                                                                                                                                        aria-label="Splits Configuration"
                                                                                                                                        style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                                                                                    >
                                                                                                                                        <SplitSquareHorizontal size={14} />
                                                                                                                                    </button>
                                                                                                                                    <button
                                                                                                                                        className="bulk-btn std-normal-btn"
                                                                                                                                        onClick={() => shiftSettingsContextVerse(matchAbs, 'after')}
                                                                                                                                        title="Next Verse"
                                                                                                                                        aria-label="Next Verse"
                                                                                                                                        style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                                                                                    >
                                                                                                                                        <ChevronLeft size={14} />
                                                                                                                                    </button>
                                                                                                                                    <button
                                                                                                                                        className="bulk-btn std-normal-btn"
                                                                                                                                        onClick={() => shiftSettingsContextVerse(matchAbs, 'before')}
                                                                                                                                        title="Previous Verse"
                                                                                                                                        aria-label="Previous Verse"
                                                                                                                                        style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                                                                                    >
                                                                                                                                        <ChevronRight size={14} />
                                                                                                                                    </button>
                                                                                                                                    <button
                                                                                                                                        className="bulk-btn std-normal-btn"
                                                                                                                                        onClick={() => resetSettingsContextVerse(matchAbs)}
                                                                                                                                        title="Reset To Comparator Verse"
                                                                                                                                        aria-label="Reset To Comparator Verse"
                                                                                                                                        style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                                                                                    >
                                                                                                                                        <RotateCcw size={14} />
                                                                                                                                    </button>
                                                                                                                                </div>
                                                                                                                                <div className="mut-context mut-verse-card">
                                                                                                                                    {mVerse && (
                                                                                                                                        <p className="arabic-text mut-core" style={{ fontSize: '1.05rem', margin: 0 }}>
                                                                            <HighlightedVerse text={mVerse.text} range={matchRange} />
                                                                                                                                        </p>
                                                                                                                                    )}
                                                                                                                                </div>
                                                                                                                            </div>
                                                                                                                        );
                                                                                                                    })}
                                                                                                                    {hasMore && (
                                                                                                                        <button
                                                                                                                            className="btn-show-more"
                                                                                                                            onClick={() => setExpandedMutItems(prev => ({ ...prev, [`${decisionKey}-full`]: !isExpanded }))}
                                                                                                                            style={{
                                                                                                                                width: '100%',
                                                                                                                                padding: '8px',
                                                                                                                                marginTop: '8px',
                                                                                                                                fontSize: '0.8rem',
                                                                                                                                color: 'var(--accent)',
                                                                                                                                background: 'none',
                                                                                                                                border: '1px dashed var(--accent)',
                                                                                                                                borderRadius: '8px',
                                                                                                                                cursor: 'pointer'
                                                                                                                            }}
                                                                                                                        >
                                                                                                                            {isExpanded ? 'Show Less' : `Show ${matches.length - 4} More Similar Verses`}
                                                                                                                        </button>
                                                                                                                    )}
                                                                                                                </>
                                                                                                            );
                                                                                                        })()}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </td>
                                                                                        </tr>
                                                                                    )}
                                                                                </React.Fragment>
                                                                            );
                                                                        });
                                                                })()}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="card modern-card" style={{
                            marginTop: '1.5rem',
                            background: 'var(--background-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '16px',
                            gridColumn: '1 / -1'
                        }}>
                            <div className="section-title"
                                onClick={() => toggleSection('advancedOptions')}
                                style={{
                                    color: 'var(--accent)',
                                    fontWeight: 700,
                                    marginBottom: sectionsExpanded.advancedOptions ? '1rem' : '0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '0.75rem',
                                    fontSize: 'clamp(1rem, 5vw, 1.1rem)',
                                    cursor: 'pointer'
                                }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div className="header-icon-badge">
                                        <Sliders size={18} />
                                    </div>
                                    <span>Advanced Options</span>
                                </div>
                                <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.advancedOptions ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            </div>

                            {sectionsExpanded.advancedOptions && (
                                <div className="adv-options">
                                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>
                                        Choose defaults and behaviors for your workflow.
                                    </div>

                                    <div className="adv-grid">
                                        <div className="adv-card">
                                            <div className="adv-card-title">
                                                <span className="adv-card-title-icon" aria-hidden="true">
                                                    <Sliders size={16} />
                                                </span>
                                                <span>Sorting & Filters</span>
                                            </div>

                                            <div className="adv-group">
                                                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.35, color: 'var(--foreground)' }}>Default Todo Filter</h4>
                                                <div className="adv-chip-row">
                                                    {todoFilterOptions.map((option) => {
                                                        const isActive = (todoDefaultFilter ?? 'all') === option.id;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setTodoDefaultFilter(option.id);
                                                                    persistSettingsUpdate({ todoDefaultFilter: option.id }, 'default todo filter');
                                                                }}
                                                                className={`adv-chip ${isActive ? 'adv-chip-active' : ''}`}
                                                            >
                                                                {isActive && <Check size={14} className="adv-check" />}
                                                                <span>{option.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="adv-group">
                                                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.35, color: 'var(--foreground)' }}>Review Sorting</h4>
                                                <div className="adv-chip-row">
                                                    {reviewSortOptions.map((option) => {
                                                        const isActive = (reviewSortOrder ?? 'surah_grouped') === option.id;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setReviewSortOrder(option.id);
                                                                    persistSettingsUpdate({ reviewSortOrder: option.id }, 'review sorting');
                                                                }}
                                                                className={`adv-chip ${isActive ? 'adv-chip-active' : ''}`}
                                                            >
                                                                {isActive && <Check size={14} className="adv-check" />}
                                                                <span>{option.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="adv-group">
                                                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.35, color: 'var(--foreground)' }}>Kanban Card Sorting</h4>
                                                <div className="adv-chip-row">
                                                    {kanbanSortOptions.map((option) => {
                                                        const isActive = (kanbanSortOrder ?? 'type_then_number') === option.id;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setKanbanSortOrder(option.id);
                                                                    persistSettingsUpdate({ kanbanSortOrder: option.id }, 'kanban sorting');
                                                                }}
                                                                className={`adv-chip ${isActive ? 'adv-chip-active' : ''}`}
                                                            >
                                                                {isActive && <Check size={14} className="adv-check" />}
                                                                <span>{option.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="adv-card">
                                            <div className="adv-card-title">
                                                <span className="adv-card-title-icon" aria-hidden="true">
                                                    <Activity size={16} />
                                                </span>
                                                <span>Workflow Behaviors</span>
                                            </div>

                                            <div className="adv-group">
                                                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.35, color: 'var(--foreground)' }}>When Moving Out of Complete</h4>
                                                <div className="adv-segmented">
                                                    {completeExitOptions.map((option) => {
                                                        const isActive = (completeExitBehavior ?? 'mindmap_only') === option.id;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    void handleCompleteExitBehaviorChange(option.id);
                                                                }}
                                                                className={`adv-seg-btn ${isActive ? 'adv-seg-active' : ''}`}
                                                            >
                                                                {isActive && <Check size={14} className="adv-check" />}
                                                                <span>{option.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="adv-group">
                                                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.35, color: 'var(--foreground)' }}>Daily Portion Default Mode</h4>
                                                <div className="adv-segmented">
                                                    {dailyPortionModeOptions.map((option) => {
                                                        const isActive = (dailyPortionMode ?? 'audio') === option.id;
                                                        const isListeningOption = option.id === 'audio';
                                                        const disableListeningOption = !isOnline && isListeningOption;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                type="button"
                                                                aria-disabled={disableListeningOption}
                                                                disabled={disableListeningOption}
                                                                onClick={() => {
                                                                    if (disableListeningOption) return;
                                                                    setDailyPortionMode(option.id);
                                                                    persistSettingsUpdate({ dailyPortionMode: option.id }, 'daily portion default mode');
                                                                }}
                                                                className={`adv-seg-btn ${isActive ? 'adv-seg-active' : ''}`}
                                                                style={disableListeningOption ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                                                                title={disableListeningOption ? 'Listening mode is unavailable offline' : undefined}
                                                            >
                                                                {isActive && <Check size={14} className="adv-check" />}
                                                                <span>{option.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="adv-group">
                                                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.35, color: 'var(--foreground)' }}>Reading Mode Layout</h4>
                                                <div className="adv-segmented">
                                                    {dailyReadingStyleOptions.map((option) => {
                                                        const isActive = (dailyReadingStyle ?? 'line_by_line') === option.id;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setDailyReadingStyle(option.id);
                                                                    persistSettingsUpdate({ dailyReadingStyle: option.id }, 'daily reading style');
                                                                }}
                                                                className={`adv-seg-btn ${isActive ? 'adv-seg-active' : ''}`}
                                                            >
                                                                {isActive && <Check size={14} className="adv-check" />}
                                                                <span>{option.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="adv-group">
                                                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.35, color: 'var(--foreground)' }}>Today Page Default Section in mobile</h4>
                                                <div className="adv-segmented">
                                                    {todayDefaultModeOptions.map((option) => {
                                                        const isActive = (todayDefaultMode ?? 'daily') === option.id;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setTodayDefaultMode(option.id);
                                                                    persistSettingsUpdate({ todayDefaultMode: option.id }, 'today default mode');
                                                                }}
                                                                className={`adv-seg-btn ${isActive ? 'adv-seg-active' : ''}`}
                                                            >
                                                                {isActive && <Check size={14} className="adv-check" />}
                                                                <span>{option.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Similar Verses Slide-over Detail View */}
            {activeMutSlideOver && (() => {
                const decisionKey = activeMutSlideOver.id;
                const existing = decisions[decisionKey] || { status: 'pending', notes: '' };
                const isConfirmed = activeMutSlideOver.group.resolutionTargets.some(target => !!decisions[target.decisionKey]?.confirmedAt);
                const group = activeMutSlideOver.group;
                const isCustom = group.phraseIds.length === 1 && group.phraseIds[0].startsWith('custom-');
                const customId = isCustom ? group.customIds[0] : undefined;
                return (
                    <div className="slide-over-overlay" onClick={closeSettingsSlideOvers}>
                        <div className="slide-over-content" onClick={e => e.stopPropagation()}>
                            <div className="slide-over-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                        <Brain size={18} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{activeMutSlideOver.title}</h3>
                                </div>
                                <button className="close-btn" onClick={closeSettingsSlideOvers}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="slide-over-body">
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    <div style={{ flex: 1, minWidth: '140px' }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', display: 'block', marginBottom: '4px' }}>Status</label>
                                        <select
                                            value={existing.status}
                                            onChange={e => applyDecisionToTargets(group.resolutionTargets, targetExisting => ({ ...targetExisting, status: e.target.value as any }))}
                                            className="maturity-select"
                                            style={{ width: '100%', padding: '8px' }}
                                        >
                                            {MUT_STATES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                        <button
                                        className={`bulk-btn std-normal-btn ${isConfirmed ? 'learned' : ''}`}
                                        onClick={() => {
                                            applyDecisionToTargets(group.resolutionTargets, targetExisting => {
                                                if (isConfirmed) return { ...targetExisting, confirmedAt: undefined, status: 'pending' as const };
                                                return { ...targetExisting, confirmedAt: new Date().toISOString() };
                                            });
                                        }}
                                        style={{ height: '38px', minWidth: '100px' }}
                                    >
                                        {isConfirmed ? 'Resolved' : 'Mark Resolved'}
                                    </button>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', display: 'block', marginBottom: '4px' }}>Notes</label>
                                    <textarea
                                        placeholder="Add your distinction notes here..."
                                        value={existing.notes || ''}
                                        maxLength={MUTASHABIH_NOTE_MAX_LENGTH}
                                        onChange={e => applyDecisionToTargets(group.resolutionTargets, targetExisting => ({ ...targetExisting, notes: e.target.value }))}
                                        style={{
                                            width: '100%',
                                            minHeight: '80px',
                                            padding: '12px',
                                            borderRadius: '12px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--background-secondary)',
                                            fontSize: '0.9rem',
                                            resize: 'vertical'
                                        }}
                                    />
                                    <div style={{ marginTop: '0.35rem', textAlign: 'right', fontSize: '0.72rem', color: 'var(--foreground-secondary)' }}>
                                        {(existing.notes || '').length}/{MUTASHABIH_NOTE_MAX_LENGTH} characters
                                    </div>
                                </div>

                                {isCustom && customId && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            className="bulk-btn reset-mut"
                                            onClick={async () => {
                                                await handleDeleteCustomMutashabih(customId);
                                                closeSettingsSlideOvers();
                                            }}
                                            style={{ minWidth: '140px' }}
                                        >
                                            <Trash2 size={14} style={{ marginRight: '4px' }} />
                                            Delete Custom
                                        </button>
                                    </div>
                                )}

                                <div className={`mut-context-block mut-detail-panel ${isConfirmed ? 'confirmed' : ''}`} style={{ margin: 0, border: '1px solid var(--border)', background: 'transparent' }}>
                                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--background-secondary)', fontWeight: 600 }}>
                                        Similarity Context
                                    </div>
                                    <div style={{ padding: '0.5rem' }}>
                                        {(() => {
                                            const sortedAbsRefs = [...group.absRefs].sort((a, b) => a - b);
                                            const firstRef = absoluteToSurahAyah(sortedAbsRefs[0]);
                                            const sourceEntries = sortedAbsRefs.map(absRef => ({
                                                absRef,
                                                ref: absoluteToSurahAyah(absRef),
                                                baseVerse: (() => {
                                                    const r = absoluteToSurahAyah(absRef);
                                                    return getVerseByRef(r.surahId, r.ayahId);
                                                })(),
                                                mutEntry: group.entries.find((entry: any) => entry?.meta?.sourceAbs === absRef || (entry?.matches || []).includes(absRef)),
                                            })).filter(item => !!item.baseVerse && !!item.mutEntry) as Array<{
                                                absRef: number;
                                                ref: { surahId: number; ayahId: number };
                                                baseVerse: any;
                                                mutEntry: any;
                                            }>;

                                            if (sourceEntries.length === 0) return null;

                                            const matchRangeByAbs = new Map<number, [number, number]>();
                                            group.entries.forEach((mutEntry: any) => {
                                                (mutEntry?.meta?.matches || []).forEach((m: any) => {
                                                    if (!matchRangeByAbs.has(m.absolute)) {
                                                        matchRangeByAbs.set(m.absolute, m.wordRange);
                                                    }
                                                });
                                            });

                                            const mergedMatches = Array.from(new Set(group.entries.flatMap((mutEntry: any) => mutEntry?.matches || [])))
                                                .filter((matchAbs: number) => {
                                                    if (sortedAbsRefs.includes(matchAbs)) return false;
                                                    const matchRef = absoluteToSurahAyah(matchAbs);
                                                    return matchRef.surahId !== activeMutSlideOver.surahId;
                                                });

                                            const isExpanded = expandedMutItems[`${decisionKey}-full`] || false;
                                            const displayedMatches = isExpanded ? mergedMatches : mergedMatches.slice(0, 4);
                                            const hasMore = mergedMatches.length > 4;

                                            return (
                                                <div className="mut-text mut-detail-source" style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                                                    <div className="mut-text-label mut-detail-label" style={{ marginBottom: '0.75rem', fontWeight: 600, color: 'var(--accent)' }}>
                                                        {getSurah(firstRef.surahId)?.name} - {sourceEntries.map(s => s.ref.ayahId).join(', ')}
                                                    </div>
                                                    <div className="mut-context mut-verse-stack">
                                                        {sourceEntries.map(({ absRef, ref, baseVerse, mutEntry }) => {
                                                            const displayedAbs = settingsContextVerseCursor[absRef] ?? absRef;
                                                            const displayedRef = absoluteToSurahAyah(displayedAbs);
                                                            const displayedVerse = getVerseByRef(displayedRef.surahId, displayedRef.ayahId);
                                                            const displayedRange = (mutEntry.meta as any).sourceAbs === displayedAbs
                                                                ? (mutEntry.meta as any).sourceRange
                                                                : matchRangeByAbs.get(displayedAbs);
                                                            return (
                                                            <div key={absRef} className="mut-verse-card" style={{ marginBottom: '1rem' }}>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', direction: 'ltr', gap: '0.4rem', marginBottom: '0.6rem' }}>
                                                                    <button
                                                                        className="bulk-btn std-normal-btn"
                                                                        onClick={() => openMindmapFromMutContext(displayedRef.surahId)}
                                                                        title="Mindmap Editor"
                                                                        aria-label="Mindmap Editor"
                                                                        style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                    >
                                                                        <PenTool size={14} />
                                                                    </button>
                                                                    <button
                                                                        className="bulk-btn std-normal-btn"
                                                                        onClick={() => openSplitsFromMutContext(displayedRef.surahId)}
                                                                        title="Splits Configuration"
                                                                        aria-label="Splits Configuration"
                                                                        style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                    >
                                                                        <SplitSquareHorizontal size={14} />
                                                                    </button>
                                                                    <button
                                                                        className="bulk-btn std-normal-btn"
                                                                        onClick={() => shiftSettingsContextVerse(absRef, 'after')}
                                                                        title="Next Verse"
                                                                        aria-label="Next Verse"
                                                                        style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                    >
                                                                        <ChevronLeft size={14} />
                                                                    </button>
                                                                    <button
                                                                        className="bulk-btn std-normal-btn"
                                                                        onClick={() => shiftSettingsContextVerse(absRef, 'before')}
                                                                        title="Previous Verse"
                                                                        aria-label="Previous Verse"
                                                                        style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                    >
                                                                        <ChevronRight size={14} />
                                                                    </button>
                                                                    <button
                                                                        className="bulk-btn std-normal-btn"
                                                                        onClick={() => resetSettingsContextVerse(absRef)}
                                                                        title="Reset To Origin Verse"
                                                                        aria-label="Reset To Origin Verse"
                                                                        style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                    >
                                                                        <RotateCcw size={14} />
                                                                    </button>
                                                                </div>
                                                                <p className="arabic-text mut-core" style={{ fontSize: '1.15rem', marginBottom: '0.6rem' }}>
                                                                    {sourceEntries.length > 1 && (
                                                                        <span className="verse-badge mut-detail-ayah-badge">{displayedRef.ayahId}</span>
                                                                    )}
                                                                    <HighlightedVerse
                                                                        text={displayedVerse?.text || baseVerse.text}
                                                                        range={displayedRange}
                                                                    />
                                                                </p>
                                                            </div>
                                                            );
                                                        })}

                                                        {displayedMatches.map((matchAbs: number, idx: number) => {
                                                            const displayedMatchAbs = settingsContextVerseCursor[matchAbs] ?? matchAbs;
                                                            const mref = absoluteToSurahAyah(displayedMatchAbs);
                                                            const msurah = getSurah(mref.surahId);
                                                            const mVerse = getVerseByRef(mref.surahId, mref.ayahId);
                                                            const matchRange = matchRangeByAbs.get(displayedMatchAbs);

                                                            return (
                                                                <div key={idx} className="mut-match-item mut-compare-card" style={{ marginBottom: '0.85rem' }}>
                                                                    <div className="mut-match-label mut-compare-label">
                                                                        Compare: Surah {msurah?.name} - {mref.ayahId}
                                                                    </div>
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', direction: 'ltr', gap: '0.4rem', marginBottom: '0.6rem' }}>
                                                                        <button
                                                                            className="bulk-btn std-normal-btn"
                                                                            onClick={() => openMindmapFromMutContext(mref.surahId)}
                                                                            title="Mindmap Editor"
                                                                            aria-label="Mindmap Editor"
                                                                            style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                        >
                                                                            <PenTool size={14} />
                                                                        </button>
                                                                        <button
                                                                            className="bulk-btn std-normal-btn"
                                                                            onClick={() => openSplitsFromMutContext(mref.surahId)}
                                                                            title="Splits Configuration"
                                                                            aria-label="Splits Configuration"
                                                                            style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                        >
                                                                            <SplitSquareHorizontal size={14} />
                                                                        </button>
                                                                        <button
                                                                            className="bulk-btn std-normal-btn"
                                                                            onClick={() => shiftSettingsContextVerse(matchAbs, 'after')}
                                                                            title="Next Verse"
                                                                            aria-label="Next Verse"
                                                                            style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                        >
                                                                            <ChevronLeft size={14} />
                                                                        </button>
                                                                        <button
                                                                            className="bulk-btn std-normal-btn"
                                                                            onClick={() => shiftSettingsContextVerse(matchAbs, 'before')}
                                                                            title="Previous Verse"
                                                                            aria-label="Previous Verse"
                                                                            style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                        >
                                                                            <ChevronRight size={14} />
                                                                        </button>
                                                                        <button
                                                                            className="bulk-btn std-normal-btn"
                                                                            onClick={() => resetSettingsContextVerse(matchAbs)}
                                                                            title="Reset To Comparator Verse"
                                                                            aria-label="Reset To Comparator Verse"
                                                                            style={{ minWidth: 34, width: 34, height: 34, borderRadius: 10, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                        >
                                                                            <RotateCcw size={14} />
                                                                        </button>
                                                                    </div>
                                                                    <div className="mut-context mut-verse-card">
                                                                        {mVerse && (
                                                                            <p className="arabic-text mut-core" style={{ fontSize: '1.05rem' }}>
                                                                                <HighlightedVerse text={mVerse.text} range={matchRange} />
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        {hasMore && (
                                                            <button
                                                                className="btn-show-more"
                                                                onClick={() => setExpandedMutItems(prev => ({ ...prev, [`${decisionKey}-full`]: !isExpanded }))}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '8px',
                                                                    marginTop: '8px',
                                                                    fontSize: '0.8rem',
                                                                    color: 'var(--accent)',
                                                                    background: 'none',
                                                                    border: '1px dashed var(--accent)',
                                                                    borderRadius: '8px',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                {isExpanded ? 'Show Less' : `Show ${mergedMatches.length - 4} More Similar Verses`}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <style jsx>{`
                .settings-support-cta {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.7rem;
                    font-size: 0.9rem;
                    color: var(--foreground-secondary);
                    white-space: nowrap;
                    flex-shrink: 0;
                    transform: translateY(-2px);
                    padding-inline: clamp(0.35rem, 2.5vw, 0.75rem);
                    box-sizing: border-box;
                }

                .settings-topbar-row {
                    flex-wrap: nowrap;
                }

                .settings-support-cta > span {
                    min-width: 0;
                    overflow-wrap: anywhere;
                }

                .settings-support-cta-mobile {
                    display: flex;
                    flex-direction: column;
                    margin-top: 0.2rem;
                    margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 5.2rem);
                    white-space: normal;
                    flex-wrap: nowrap;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    gap: 0.6rem;
                    line-height: 1.35;
                    transform: none;
                    font-size: 0.9rem;
                    color: var(--foreground-secondary);
                    width: 100%;
                    padding-inline: 0.5rem;
                }

                .settings-support-cta-mobile > span {
                    text-align: center;
                }

                .settings-support-cta-mobile .settings-support-discord-link {
                    align-self: center;
                }

                .settings-support-discord-link {
                    color: var(--foreground-secondary);
                    text-decoration: none;
                    font-weight: 600;
                    font-size: 0.85rem;
                    line-height: 1;
                    padding: 0.42rem 0.72rem;
                    border-radius: 12px;
                    border: 1px solid var(--border);
                    background: var(--background);
                    transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
                }

                .settings-support-discord-link:hover {
                    color: var(--foreground);
                    border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
                    background: var(--verse-bg);
                    transform: translateY(-1px);
                }

                @media (max-width: 1220px) {
                    .settings-topbar-row {
                        flex-wrap: wrap;
                    }

                    .settings-support-cta {
                        white-space: normal;
                        max-width: 100%;
                    }
                }

                @media (max-width: 420px) {
                    .settings-support-cta-mobile {
                        gap: 0.5rem;
                    }

                    .settings-support-discord-link {
                        max-width: 100%;
                    }
                }

                .add-custom-mut-btn {
                    background: var(--accent);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    margin-left: auto;
                    margin-right: 12px;
                    transition: all 0.2s ease;
                    opacity: 0.8;
                }
                .add-custom-mut-btn:hover {
                    opacity: 1;
                    transform: scale(1.05);
                }
                .mut-fold-header, .mobile-group-header, .group-header, .subgroup-header, .nav-item, .surah-pill, .btn-part {
                    -webkit-tap-highlight-color: transparent;
                }

                @media (max-width: 767px) {
                    .hide-mobile {
                        display: none !important;
                    }
                }

                @media (min-width: 768px) {
                    .show-mobile {
                        display: none !important;
                    }
                }

                :global(.settings-sticky-table-wrap) {
                    width: 100%;
                    max-width: 100%;
                    overflow: visible;
                }

                @media (min-width: 768px) {
                    :global(.settings-sticky-table-wrap) {
                        overflow: visible !important;
                    }

                    :global(.settings-sticky-header-table thead th) {
                        position: sticky;
                        top: 0;
                        z-index: 6;
                        background: var(--background);
                        box-shadow: inset 0 -1px 0 var(--border);
                    }
                }

                @media (min-width: 768px) and (max-width: 1024px) {
                    :global(.settings-sticky-table-wrap) {
                        overflow-x: auto !important;
                        overflow-y: visible !important;
                        -webkit-overflow-scrolling: touch;
                    }

                    .mutashabihat-table {
                        min-width: 760px !important;
                    }

                    .mutashabihat-table th,
                    .mutashabihat-table td {
                        padding: 0.55rem 0.5rem;
                        font-size: 0.78rem;
                        vertical-align: middle;
                    }

                    .mutashabihat-table th {
                        font-size: 0.74rem;
                        letter-spacing: 0.01em;
                    }

                    .mutashabihat-table th:nth-child(2),
                    .mutashabihat-table td:nth-child(2) {
                        width: 28%;
                    }

                    .mutashabihat-table th:nth-child(3),
                    .mutashabihat-table td:nth-child(3) {
                        width: 12%;
                        white-space: nowrap;
                    }

                    .mutashabihat-table th:nth-child(4),
                    .mutashabihat-table td:nth-child(4) {
                        width: 20%;
                    }

                    .mutashabihat-table th:nth-child(5),
                    .mutashabihat-table td:nth-child(5) {
                        width: 20%;
                    }

                    .mutashabihat-table th:nth-child(6),
                    .mutashabihat-table td:nth-child(6) {
                        width: 20%;
                    }

                    .mutashabihat-table .maturity-select {
                        padding: 4px 6px;
                        font-size: 0.75rem;
                        width: 100%;
                    }

                    .mutashabihat-resolve-btn {
                        min-width: 110px !important;
                        padding: 4px 8px;
                        width: 100%;
                        max-width: 100%;
                        min-width: 0 !important;
                        white-space: normal;
                        line-height: 1.2;
                        box-sizing: border-box;
                    }

                    .mutashabihat-note-btn {
                        min-width: 110px !important;
                        padding: 4px 8px;
                        width: 100%;
                        max-width: 100%;
                        min-width: 0 !important;
                        white-space: normal;
                        line-height: 1.2;
                        box-sizing: border-box;
                    }

                    .mutashabihat-table .bulk-btn {
                        white-space: normal;
                        text-align: center;
                        height: auto;
                        word-break: normal;
                        overflow-wrap: normal;
                    }

                    .mutashabihat-note-actions {
                        flex-wrap: wrap;
                        justify-content: flex-start;
                        gap: 6px;
                    }

                    .mutashabihat-table .entries-badge {
                        font-size: 0.64rem;
                        padding: 2px 6px;
                    }
                }

                .mut-fold-header .mut-chevron {
                        margin-left: 0;
                    }
                    .bulk-btn {
                        padding: 4px 10px;
                        border-radius: 6px;
                        font-size: 0.7rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        border: 1px solid var(--border);
                        background: var(--background);
                        color: var(--foreground-secondary);
                    }
                    .bulk-btn:hover {
                        background: var(--background-secondary);
                        transform: translateY(-1px);
                    }
                    .bulk-btn.learned:hover {
                        color: #22c55e;
                        border-color: #22c55e;
                        background: #22c55e10;
                    }
                    .bulk-btn.new:hover {
                        color: var(--danger);
                        border-color: var(--danger);
                        background: var(--danger)10;
                    }
                    .bulk-btn.skipped:hover {
                        color: #94a3b8;
                        border-color: #94a3b8;
                        background: #94a3b810;
                    }
                    .bulk-btn.reset-mut:hover {
                        color: var(--accent);
                        border-color: var(--accent);
                        background: var(--accent)10;
                    }

                    /* Slide-over styles */
                    .slide-over-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.4);
                        backdrop-filter: blur(4px);
                        z-index: 2000;
                        display: flex;
                        justify-content: flex-end;
                        animation: fadeIn 0.3s ease;
                    }

                    .slide-over-content {
                        width: 90%;
                        max-width: 450px;
                        height: 100%;
                        background: var(--background);
                        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
                        display: flex;
                        flex-direction: column;
                        animation: slideIn 0.3s ease;
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }

                    @keyframes slideIn {
                        from { transform: translateX(100%); }
                        to { transform: translateX(0); }
                    }

                    .slide-over-header {
                        padding: 1.25rem;
                        border-bottom: 1px solid var(--border);
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        background: var(--background-secondary);
                    }

                    .close-btn {
                        background: none;
                        border: none;
                        color: var(--foreground-secondary);
                        cursor: pointer;
                        padding: 4px;
                        display: flex;
                        border-radius: 50%;
                        transition: background 0.2s;
                    }

                    .close-btn:hover {
                        background: var(--border);
                    }

                    .slide-over-body {
                        flex: 1;
                        overflow-y: auto;
                        padding: 1.25rem;
                        padding-bottom: calc(1.25rem + var(--mobile-bottom-toolbar-offset, 0px));
                        -webkit-overflow-scrolling: touch;
                    }

                    .mobile-node-list {
                        display: flex;
                        flex-direction: column;
                        gap: 1rem;
                    }

                    .mobile-node-card {
                        background: var(--background-secondary);
                        border: 1px solid var(--border);
                        border-radius: 12px;
                        padding: 1rem;
                    }

                    .node-card-main {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 1rem;
                    }

                    .node-target {
                        font-weight: 600;
                        font-size: 0.95rem;
                    }

                    .node-card-details {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 0.5rem;
                        padding-top: 1rem;
                        border-top: 1px dashed var(--border);
                    }

                    .stat-item {
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                    }

                    .stat-label {
                        font-size: 0.65rem;
                        color: var(--foreground-secondary);
                        text-transform: uppercase;
                        letter-spacing: 0.02em;
                    }

                    .stat-value {
                        font-size: 0.8rem;
                        font-weight: 600;
                    }

                    .status-overdue {
                        color: var(--danger);
                    }

                .status-badge {
                    font-size: 0.7rem;
                    padding: 2px 6px;
                    border-radius: 4px;
                    background: var(--accent-light);
                    color: white;
                    font-weight: 600;
                }
                .status-badge.entries-badge {
                    background: var(--accent);
                    color: white;
                }

                .mut-detail-panel {
                    border-radius: 10px;
                }

                .mut-detail-source {
                    padding: 0;
                }

                .mut-detail-label {
                    font-size: 0.88rem;
                    font-weight: 700;
                    color: var(--accent);
                }

                .mut-verse-stack {
                    display: flex;
                    flex-direction: column;
                    gap: 0.7rem;
                }

                .mut-verse-card {
                    border: none;
                    background: transparent;
                    border-radius: 0;
                    padding: 0;
                }

                .mut-compare-list {
                    border-top: 1px solid var(--border);
                    padding-top: 0.9rem;
                }

                .mut-compare-card {
                    border: none;
                    background: transparent;
                    border-radius: 0;
                    padding: 0;
                    margin-bottom: 0.95rem;
                }

                .mut-compare-label {
                    margin-bottom: 0.45rem;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: var(--foreground-secondary);
                }

                .mut-detail-panel .mut-core {
                    background: transparent;
                    border-right: none;
                    padding: 0;
                    font-weight: 500;
                    color: var(--foreground);
                    line-height: 1.95;
                    letter-spacing: 0;
                }

                .mut-detail-ayah-badge {
                    background: var(--accent);
                    color: white;
                    border-radius: 999px;
                    padding: 0.04rem 0.38rem;
                    margin-right: 0;
                    margin-inline: 0.2rem 0.32rem;
                    font-size: 0.64rem;
                    font-weight: 700;
                    border: none;
                    vertical-align: middle;
                }

                .mut-detail-panel .mut-context {
                    direction: rtl;
                    text-align: right;
                }

                .mut-detail-panel .mut-compare-card .mut-verse-card {
                    background: transparent;
                }

                .adv-options {
                    display: flex;
                    flex-direction: column;
                    gap: 0.9rem;
                }

                .adv-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 0.9rem;
                }

                .adv-card {
                    background: var(--background);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    padding: 0.9rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.85rem;
                }

                .adv-card-title {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.45rem;
                    font-weight: 700;
                    font-size: 0.95rem;
                    color: var(--foreground);
                }

                .adv-card-title-icon,
                .adv-section-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--foreground-secondary);
                }

                .adv-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .adv-label {
                    font-weight: 600;
                    font-size: 0.85rem;
                    color: var(--foreground);
                }

                .adv-chip-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }

                .adv-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    border-radius: 10px;
                    border: 1px solid var(--border);
                    background: var(--background);
                    color: var(--foreground-secondary);
                    font-size: 0.78rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .adv-chip:hover {
                    background: var(--verse-bg);
                }

                .adv-chip-active {
                    border-color: var(--accent);
                    color: var(--accent);
                    background: var(--verse-bg);
                    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
                }

                .adv-segmented {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                    gap: 6px;
                    padding: 4px;
                    border-radius: 12px;
                    border: 1px solid var(--border);
                    background: var(--background);
                }

                .adv-seg-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 10px;
                    border-radius: 10px;
                    border: 1px solid transparent;
                    background: transparent;
                    color: var(--foreground-secondary);
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .adv-seg-btn:hover {
                    background: var(--verse-bg);
                }

                .adv-seg-active {
                    border-color: var(--accent);
                    color: var(--accent);
                    background: var(--verse-bg);
                }

                .adv-check {
                    color: var(--accent);
                    flex-shrink: 0;
                }

                @media (min-width: 900px) {
                    .adv-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }

                @media (max-width: 1024px) {
                    .account-action-btn {
                        font-size: 0.82rem !important;
                        line-height: 1.15 !important;
                        padding-left: 0.5rem !important;
                        padding-right: 0.5rem !important;
                    }
                }
                `}</style>

            <AddCustomMutashabihModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={handleAddCustomMutashabih}
                initialSurahId={targetSurahId}
            />
            <MutashabihNoteModal
                isOpen={!!noteModal}
                title={noteModal?.title || 'Edit Note'}
                initialNote={noteModal?.initialNote || ''}
                maxLength={MUTASHABIH_NOTE_MAX_LENGTH}
                onClose={() => setNoteModal(null)}
                onSave={(note) => {
                    if (!noteModal) return;
                    const { representativeAbs, decisionKey, resolutionTargets } = noteModal;
                    if (resolutionTargets && resolutionTargets.length > 0) {
                        applyDecisionToTargets(resolutionTargets, existing => ({ ...existing, notes: note }));
                    } else {
                        const existing = decisions[decisionKey] || { status: 'pending', notes: '' };
                        void handleDecisionUpdate(representativeAbs, { ...existing, notes: note }, decisionKey);
                    }
                    setNoteModal(null);
                }}
            />

            {/* Mobile Slide-over for Node Management */}
            {activeSlideOverGroup && (
                <div className="slide-over-overlay" onClick={closeSettingsSlideOvers}>
                    <div className="slide-over-content" onClick={e => e.stopPropagation()}>
                        <div className="slide-over-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                    {activeSlideOverGroup.type === 'verse_segment' ? <Book size={18} /> : <MapIcon size={18} />}
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{activeSlideOverGroup.title}</h3>
                            </div>
                            <button className="close-btn" onClick={closeSettingsSlideOvers}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="slide-over-body">
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                                {/* Set All dropdown matching desktop */}
                                <select
                                    className="maturity-select"
                                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                                    value=""
                                    onChange={async (e) => {
                                        const val = e.target.value as any;
                                        if (!val) return;

                                        if (activeSlideOverGroup.type === 'verse_segment' && activeSlideOverGroup.surahId) {
                                            await handleGroupMaturityReset('verse', val, activeSlideOverGroup.surahId, activeSlideOverGroup.title);
                                        } else {
                                            await handleGroupMaturityReset(activeSlideOverGroup.type as any, val);
                                        }

                                        // Update local state to reflect changes
                                            setActiveSlideOverGroup(prev => {
                                                if (!prev) return null;
                                                const updatedNodes = getFilteredNodesForSlideOver(prev.type, prev.surahId);
                                                return { ...prev, nodes: updatedNodes };
                                            });
                                    }}
                                >
                                    <option value="">Set Subgroup...</option>
                                    <option value="reset">Reset</option>
                                    <option value="medium">Medium</option>
                                    <option value="strong">Strong</option>
                                    <option value="mastered">Mastered</option>
                                </select>
                            </div>

                            <div className="mobile-node-list">
                                {activeSlideOverGroup.nodes.length > 0 ? (
                                    activeSlideOverGroup.nodes
                                        .sort((a, b) => {
                                            if (activeSlideOverGroup.type === 'verse_segment') return (a.startVerse || 0) - (b.startVerse || 0);
                                            if (activeSlideOverGroup.type === 'mindmap') return (resolveNodeSurahId(a) || 0) - (resolveNodeSurahId(b) || 0);
                                            return (resolveNodePartId(a) || 0) - (resolveNodePartId(b) || 0);
                                        })
                                        .map(node => (
                                            <div key={node.id} className="mobile-node-card">
                                                <div className="node-card-main">
                                                    <div className="node-target">
                                                        {activeSlideOverGroup.type === 'verse_segment' ? `Ayat ${node.startVerse}-${node.endVerse}` :
                                                            activeSlideOverGroup.type === 'mindmap'
                                                                ? (() => {
                                                                    const surahId = resolveNodeSurahId(node);
                                                                    return surahId ? `${surahId}. ${getSurah(surahId)?.name}` : '-';
                                                                })()
                                                                : (() => {
                                                                    const partId = resolveNodePartId(node);
                                                                    return partId !== null ? `Part ${partId}` : '-';
                                                                })()}
                                                    </div>
                                                    <select
                                                        value=""
                                                        onChange={async (e) => {
                                                            const val = e.target.value as any;
                                                            if (!val) return;
                                                            await handleNodeMaturityReset(node.id, val);

                                                            // Update local nodes in slideover
                                                            setActiveSlideOverGroup(prev => {
                                                                if (!prev) return null;
                                                                const updatedNodes = getFilteredNodesForSlideOver(prev.type, prev.surahId);
                                                                return { ...prev, nodes: updatedNodes };
                                                            });
                                                        }}
                                                        className="maturity-select"
                                                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                                                    >
                                                        <option value="">Set to...</option>
                                                        <option value="reset">Reset</option>
                                                        <option value="medium">Medium</option>
                                                        <option value="strong">Strong</option>
                                                        <option value="mastered">Mastered</option>
                                                    </select>
                                                </div>
                                                <div className="node-card-details">
                                                    <div className="stat-item">
                                                        <span className="stat-label">Interval</span>
                                                        <span className="stat-value">{formatKnowledgeTrackingInterval(getNodeStability(node))}</span>
                                                    </div>
                                                    <div className="stat-item">
                                                        <span className="stat-label">Difficulty</span>
                                                        <span className="stat-value">{formatKnowledgeTrackingDifficulty(getNodeDifficulty(node))}</span>
                                                    </div>
                                                    <div className="stat-item">
                                                        <span className="stat-label">Reps</span>
                                                        <span className="stat-value">{getNodeReps(node)}</span>
                                                    </div>
                                                    <div className="stat-item">
                                                        <span className="stat-label">Next</span>
                                                        <span className={`stat-value ${(getNodeDueDate(node) || '') <= new Date().toISOString().split('T')[0] ? 'status-overdue' : ''}`}>
                                                            {formatKnowledgeTrackingDueDate(getNodeDueDate(node))}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                ) : (
                                    <div className="empty-state">No items found</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={isDeleteFeedbackModalOpen}
                title="Before You Leave"
                message={deleteFeedbackModalMessage}
                confirmLabel={isDeletingAccount ? 'Stopping renewal...' : 'Delete & Stop Renewal'}
                cancelLabel="Back"
                isDestructive
                isProcessing={isDeletingAccount}
                disabled={deleteReasonCode === 'other' && !deleteReasonDetail.trim()}
                onConfirm={handleSubmitDeleteAccount}
                onCancel={() => {
                    if (isDeletingAccount) return;
                    setDeleteReasonError(null);
                    setIsDeleteFeedbackModalOpen(false);
                }}
            >
                <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1.5rem' }}>
                    {DELETE_CHURN_REASONS.map((option) => (
                        <label
                            key={option.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.55rem',
                                fontSize: '0.9rem',
                                color: 'var(--foreground)',
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="radio"
                                name="delete-churn-reason"
                                value={option.id}
                                checked={deleteReasonCode === option.id}
                                onChange={() => setDeleteReasonCode(option.id)}
                                style={{ cursor: 'pointer' }}
                            />
                            <span>{option.label}</span>
                        </label>
                    ))}

                    <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.25rem' }}>
                        <textarea
                            value={deleteReasonDetail}
                            onChange={(event) => setDeleteReasonDetail(event.target.value.slice(0, DELETE_REASON_DETAIL_MAX_LENGTH))}
                            placeholder={deleteReasonCode === 'other' ? 'Please provide details (required)' : 'Optional details (what we can improve)'}
                            rows={3}
                            style={{
                                width: '100%',
                                borderRadius: '10px',
                                border: deleteReasonCode === 'other' && deleteReasonError && !deleteReasonDetail.trim() ? '1px solid var(--danger)' : '1px solid var(--border)',
                                background: 'var(--background-secondary)',
                                color: 'var(--foreground)',
                                padding: '0.65rem 0.75rem',
                                resize: 'vertical',
                                minHeight: '86px',
                            }}
                        />
                        <div style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', textAlign: 'right' }}>
                            {deleteReasonDetail.length}/{DELETE_REASON_DETAIL_MAX_LENGTH}
                        </div>
                    </div>
                    {deleteReasonError && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 600 }}>
                            {deleteReasonError}
                        </div>
                    )}
                </div>
            </ConfirmationModal>

            <div
                className="toast-container"
                style={{
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    pointerEvents: 'none',
                    maxWidth: 'calc(100vw - 40px)',
                }}
            >
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`review-toast ${t.type}`}
                        style={{
                            padding: '0.65rem 1rem',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                            animation: 'slideInRight 0.3s ease-out',
                            background: t.type === 'success'
                                ? 'color-mix(in srgb, var(--success) 18%, var(--background-secondary))'
                                : 'color-mix(in srgb, var(--danger) 16%, var(--background-secondary))',
                            border: '1px solid var(--border)',
                            color: 'var(--foreground)',
                            minWidth: '180px',
                            fontSize: '0.85rem',
                            pointerEvents: 'auto',
                            backdropFilter: 'blur(12px)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {t.type === 'success' ? <Check size={18} /> : <X size={18} />}
                            <span style={{ fontWeight: 600 }}>{t.message}</span>
                            <button
                                onClick={() => setToasts((prev) => prev.filter((toast) => toast.id !== t.id))}
                                style={{
                                    background: 'color-mix(in srgb, var(--foreground) 10%, transparent)',
                                    border: '1px solid color-mix(in srgb, var(--foreground) 10%, transparent)',
                                    color: 'inherit',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    cursor: 'pointer',
                                    marginLeft: 'auto',
                                }}
                            >
                                Close
                            </button>
                        </div>
                        {t.info && (
                            <div
                                style={{
                                    fontSize: '0.8rem',
                                    opacity: 0.9,
                                    paddingLeft: '28px',
                                    whiteSpace: 'pre-line',
                                }}
                            >
                                {t.info}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}
