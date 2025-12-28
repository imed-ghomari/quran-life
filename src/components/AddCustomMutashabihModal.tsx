'use client';

import React, { useState, useEffect } from 'react';
import { SURAHS } from '@/lib/quranData';
import { CustomMutashabih, MutashabihatDecision } from '@/lib/storage';
import { X } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (mut: CustomMutashabih) => void;
    initialSurahId?: number;
}

const MUT_STATES: { value: MutashabihatDecision['status']; label: string }[] = [
    { value: 'pending', label: 'Pending Review' },
    { value: 'ignored', label: 'Ignored (Not similar)' },
    { value: 'solved_mindmap', label: 'Solved by Mindmap' },
    { value: 'solved_note', label: 'Solved by Note' },
];

export default function AddCustomMutashabihModal({ isOpen, onClose, onSave, initialSurahId }: Props) {
    const [surah1, setSurah1] = useState<number>(initialSurahId || 1);
    const [ayah1, setAyah1] = useState<number>(1);
    const [surah2, setSurah2] = useState<number>(initialSurahId || 1);
    const [ayah2, setAyah2] = useState<number>(1);
    const [status, setStatus] = useState<MutashabihatDecision['status']>('pending');
    const [note, setNote] = useState('');

    useEffect(() => {
        if (initialSurahId) {
            setSurah1(initialSurahId);
            setSurah2(initialSurahId);
        }
    }, [initialSurahId, isOpen]);

    if (!isOpen) return null;

    const s1Data = SURAHS.find(s => s.id === surah1);
    const s2Data = SURAHS.find(s => s.id === surah2);

    const handleSave = () => {
        const newMut: CustomMutashabih = {
            id: Math.random().toString(36).substring(2, 11),
            verse1: { surahId: surah1, ayahId: ayah1 },
            verse2: { surahId: surah2, ayahId: ayah2 },
            status,
            note,
            createdAt: new Date().toISOString(),
            isCustom: true,
        };
        onSave(newMut);
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Add Custom Mutashabih</h3>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>
                
                <div className="modal-body">
                    <div className="form-group">
                        <label>Verse 1</label>
                        <div className="verse-select-row">
                            <select value={surah1} onChange={e => {
                                setSurah1(Number(e.target.value));
                                setAyah1(1);
                            }}>
                                {SURAHS.map(s => (
                                    <option key={s.id} value={s.id}>{s.id}. {s.name}</option>
                                ))}
                            </select>
                            <select value={ayah1} onChange={e => setAyah1(Number(e.target.value))}>
                                {Array.from({ length: s1Data?.verseCount || 0 }, (_, i) => i + 1).map(v => (
                                    <option key={v} value={v}>Ayah {v}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Verse 2</label>
                        <div className="verse-select-row">
                            <select value={surah2} onChange={e => {
                                setSurah2(Number(e.target.value));
                                setAyah2(1);
                            }}>
                                {SURAHS.map(s => (
                                    <option key={s.id} value={s.id}>{s.id}. {s.name}</option>
                                ))}
                            </select>
                            <select value={ayah2} onChange={e => setAyah2(Number(e.target.value))}>
                                {Array.from({ length: s2Data?.verseCount || 0 }, (_, i) => i + 1).map(v => (
                                    <option key={v} value={v}>Ayah {v}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Status</label>
                        <select value={status} onChange={e => setStatus(e.target.value as any)}>
                            {MUT_STATES.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Note (Optional)</label>
                        <textarea 
                            value={note} 
                            onChange={e => setNote(e.target.value)}
                            placeholder="Add your distinction note here..."
                            rows={3}
                        />
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave}>Save Mutashabih</button>
                </div>
            </div>

            <style jsx>{`
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    backdrop-filter: blur(4px);
                    padding: 1rem;
                }
                .modal-content {
                    background: var(--background);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                    width: 100%;
                    max-width: 500px;
                    max-height: 85vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                    margin-bottom: 60px; /* Space for bottom navigation/buttons */
                }
                @media (max-width: 480px) {
                    .modal-content {
                        max-width: 95%;
                        margin-bottom: 80px;
                    }
                    .modal-body {
                        padding: 1rem;
                        gap: 1rem;
                    }
                    .modal-header {
                        padding: 0.75rem 1rem;
                    }
                    .modal-footer {
                        padding: 0.75rem 1rem;
                    }
                }
                .modal-header {
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-header h3 {
                    margin: 0;
                    font-size: 1.25rem;
                }
                .close-btn {
                    background: none;
                    border: none;
                    color: var(--foreground-secondary);
                    cursor: pointer;
                    padding: 4px;
                }
                .modal-body {
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .form-group label {
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: var(--foreground-secondary);
                }
                .verse-select-row {
                    display: grid;
                    grid-template-columns: 2fr 1fr;
                    gap: 0.5rem;
                }
                select, textarea {
                    padding: 0.75rem;
                    border-radius: 8px;
                    border: 1px solid var(--border);
                    background: var(--background-secondary);
                    color: var(--foreground);
                    font-size: 0.95rem;
                }
                textarea {
                    resize: vertical;
                }
                .modal-footer {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid var(--border);
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.75rem;
                    background: var(--background-secondary);
                }
                .btn {
                    padding: 0.6rem 1.2rem;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-secondary {
                    background: transparent;
                    border: 1px solid var(--border);
                    color: var(--foreground);
                }
                .btn-primary {
                    background: var(--accent);
                    border: 1px solid var(--accent);
                    color: white;
                }
                .btn:hover {
                    opacity: 0.9;
                }
            `}</style>
        </div>
    );
}
