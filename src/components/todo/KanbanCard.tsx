import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { KanbanItem } from './types';
import { AlertTriangle, Brain, Map, MapPinned, Check, PenTool, Layout, BookOpen, Clock, ExternalLink } from 'lucide-react';
import { getSurah } from '@/lib/quranData';

interface KanbanCardProps {
    item: KanbanItem;
    index: number;
    onClick: () => void;
}

const KanbanCard = ({ item, index, onClick }: KanbanCardProps) => {
    return (
        <Draggable draggableId={item.id} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    onClick={onClick}
                    className={`
                        card group relative cursor-pointer transition-all duration-200 ease-out !p-6
                        !rounded-2xl !mb-0 border border-[var(--border)] bg-[var(--background-secondary)]
                        dark:shadow-lg dark:shadow-black/20
                        hover:border-[var(--accent)] hover:shadow-xl hover:shadow-black/5
                        ${snapshot.isDragging ? 'z-50 shadow-2xl scale-[1.02] bg-[var(--background-secondary)] !border-[var(--accent)]' : ''}
                        ${item.status === 'in-progress' ? 'border-l-2 !border-l-[var(--accent)]' : ''}
                        ${item.status === 'complete' ? 'opacity-80' : ''}
                    `}
                    style={{
                        ...provided.draggableProps.style,
                    }}
                >
                    <div className="flex flex-col space-y-3">
                        {renderCardZones(item)}
                    </div>
                </div>
            )}
        </Draggable>
    );
};

function renderCardZones(item: KanbanItem) {
    let zone1 = { label: "TASK", color: "bg-blue-400" };
    let zone2 = { english: "", arabic: "" };
    let zone3 = "";
    let zone4 = { meta: "", actionLabel: "Open", actionIcon: <ExternalLink size={14} /> };

    switch (item.type) {
        case 'suspended': {
            const issue = item.data;
            const surah = getSurah(issue.surahId);
            zone1 = { label: "FIX REQUIRED", color: "var(--danger)" };
            zone2 = {
                english: surah?.name || `Surah ${issue.surahId}`,
                arabic: surah?.arabicName || 'الإصلاح'
            };
            zone3 = issue.label || "Review anchors to fix suspended status.";
            zone4 = {
                meta: `${issue.surahId}:${issue.startVerse}`,
                actionLabel: "View",
                actionIcon: <Layout size={14} />
            };
            break;
        }
        case 'similarity': {
            const sim = item.data;
            zone1 = { label: "SIMILARITY", color: "var(--warning)" };
            zone2 = {
                english: sim.surah?.name || "Similarity",
                arabic: sim.surah?.arabicName || 'التشابه'
            };
            zone3 = `${sim.count} pending points to distinguish. Requires deep analysis of contextual nuances.`;
            zone4 = {
                meta: "Needs distinction",
                actionLabel: "Manage",
                actionIcon: <PenTool size={14} />
            };
            break;
        }
        case 'part': {
            const partTask = item.data;
            zone1 = { label: "PART MAP", color: "var(--accent)" };
            zone2 = {
                english: `Part ${partTask.part}`,
                arabic: `الجزء ${partTask.part}`
            };
            zone4 = {
                meta: "Full Part Map",
                actionLabel: "Open",
                actionIcon: <BookOpen size={14} />
            };
            break;
        }
        case 'surah': {
            const surahTask = item.data;
            zone1 = { label: "SURAH MAP", color: "var(--success)" };
            zone2 = {
                english: surahTask.surah.name,
                arabic: surahTask.surah.arabicName || 'سورة'
            };
            zone4 = {
                meta: `${surahTask.surah.verseCount} Verses`,
                actionLabel: "Open",
                actionIcon: <ExternalLink size={14} />
            };
            break;
        }
    }

    return (
        <>
            {/* EYEBROW: The High-Contrast Pill - using app secondary colors */}
            <div className="flex">
                <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.1em] opacity-60"
                    style={{
                        backgroundColor: `color-mix(in srgb, ${zone1.color}, transparent 92%)`,
                        color: zone1.color
                    }}
                >
                    {zone1.label}
                </span>
            </div>

            {/* TITLE AREA: English & Arabic on same line, spread to edges */}
            <div className="flex items-center justify-between gap-3">
                <h4 className="text-lg font-bold text-[var(--foreground)] tracking-tight">
                    {zone2.english}
                </h4>
                <span className="text-[17px] font-arabic text-[var(--foreground)] opacity-80">
                    {zone2.arabic}
                </span>
            </div>

            {/* DESCRIPTION: Breathable text with clear air */}
            <div className="py-2">
                <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed line-clamp-2">
                    {zone3}
                </p>
            </div>

            {/* FOOTER: Separator with pt-5 */}
            <div className="border-t border-[var(--border)] pt-5 flex items-center justify-between">
                <div className="text-[11px] font-medium text-[var(--foreground-secondary)] opacity-80">
                    {zone4.meta}
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--foreground)] opacity-80 hover:opacity-100 transition-all cursor-pointer">
                    <span className="leading-none">{zone4.actionLabel}</span>
                    <div className="p-1 rounded-full bg-[var(--verse-bg)] transition-colors">
                        {zone4.actionIcon}
                    </div>
                </div>
            </div>
        </>
    );
}



export default KanbanCard;
