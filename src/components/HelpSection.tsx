'use client';

import React, { useState } from 'react';
import { HelpCircle, ChevronDown, LucideIcon } from 'lucide-react';

export interface HelpCardProps {
    title: string;
    icon: LucideIcon;
    description: string;
    items?: string[];
}

interface HelpSectionProps {
    title?: string;
    cards: HelpCardProps[];
}

export default function HelpSection({ title = "How it works", cards }: HelpSectionProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="help-container" style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'none',
                    border: 'none',
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--foreground-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    borderRadius: '8px',
                    transition: 'all 0.2s ease',
                    marginLeft: '-0.75rem',
                    width: 'auto'
                }}
                className="help-toggle-btn"
            >
                <HelpCircle size={16} />
                <span>{title}</span>
                <ChevronDown
                    size={14}
                    style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.3s ease',
                        opacity: 0.7
                    }}
                />
            </button>

            {isOpen && (
                <div className="help-content" style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                    gap: '1.5rem',
                    marginTop: '1.25rem',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    {cards.map((card, idx) => {
                        const Icon = card.icon;
                        return (
                            <div key={idx} className="help-card" style={{
                                padding: '1rem',
                                background: 'rgba(var(--accent-rgb), 0.03)',
                                borderRadius: '12px',
                                border: '1px solid var(--border)'
                            }}>
                                <h4 style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.6rem', 
                                    fontSize: '0.95rem',
                                    marginBottom: '0.75rem',
                                    color: 'var(--foreground)'
                                }}>
                                    <Icon size={16} className="text-accent" />
                                    <span>{card.title}</span>
                                </h4>
                                <p style={{ 
                                    fontSize: '0.85rem', 
                                    lineHeight: '1.5', 
                                    color: 'var(--foreground-secondary)',
                                    marginBottom: '1rem'
                                }}>
                                    {card.description}
                                </p>
                                {card.items && card.items.length > 0 && (
                                    <ul style={{ 
                                        paddingLeft: '1.25rem', 
                                        margin: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.4rem'
                                    }}>
                                        {card.items.map((item, i) => (
                                            <li key={i} style={{ 
                                                fontSize: '0.8rem', 
                                                color: 'var(--foreground-secondary)',
                                                opacity: 0.9
                                            }}>
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            <style jsx>{`
                .help-toggle-btn:hover {
                    background: rgba(var(--accent-rgb), 0.05);
                    color: var(--foreground);
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
