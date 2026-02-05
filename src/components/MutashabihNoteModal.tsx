'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
    isOpen: boolean;
    title: string;
    initialNote: string;
    onClose: () => void;
    onSave: (note: string) => void;
}

export default function MutashabihNoteModal({ isOpen, title, initialNote, onClose, onSave }: Props) {
    const [note, setNote] = useState(initialNote);

    useEffect(() => {
        if (isOpen) {
            setNote(initialNote || '');
        }
    }, [isOpen, initialNote]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="modal-body">
                    <div className="form-group">
                        <label>Note</label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Add your distinction note here..."
                            rows={4}
                        />
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => onSave(note)}>Save Note</button>
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
                    margin-bottom: 60px;
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
                    font-size: 1.1rem;
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
                textarea {
                    padding: 0.75rem;
                    border-radius: 8px;
                    border: 1px solid var(--border);
                    background: var(--background-secondary);
                    color: var(--foreground);
                    font-size: 0.95rem;
                    resize: vertical;
                    min-height: 110px;
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
                .btn-primary {
                    background: var(--accent);
                    color: white;
                    border: none;
                }
                .btn-secondary {
                    background: transparent;
                    color: var(--foreground-secondary);
                    border: 1px solid var(--border);
                }
                .btn:hover {
                    transform: translateY(-1px);
                }
            `}</style>
        </div>
    );
}
