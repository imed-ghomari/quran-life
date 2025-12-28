'use client';

import React, { useState, useEffect } from 'react';
import { HelpCircle, X, LucideIcon, ChevronDown } from 'lucide-react';

export interface HelpCardProps {
    title: string;
    icon: LucideIcon;
    description: string;
    items?: string[];
}

interface DocumentationModalProps {
    title?: string;
    cards: HelpCardProps[];
}

export default function DocumentationModal({ title = "How it works", cards }: DocumentationModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Button position based on layout
    // Desktop: Bottom Right (fixed bottom-8 right-8)
    // Mobile: Right Edge, Vertically Centered, Partially Hidden
    const buttonStyle: React.CSSProperties = isMobile
        ? {
            position: 'fixed',
            top: '40%',
            right: '-16px', // Partially hidden
            zIndex: 50,
            transform: 'translateY(-50%)',
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            opacity: 0.8
        }
        : {
            position: 'fixed',
            bottom: '2rem',
            right: '-16px', // Partially hidden
            zIndex: 50,
            opacity: 0.8,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            transition: 'transform 0.2s ease, right 0.2s ease, opacity 0.2s ease'
        };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="doc-trigger-btn"
                style={{
                    ...buttonStyle,
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '48px',
                    height: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    transition: 'transform 0.2s ease'
                }}
                title={title}
            >
                <HelpCircle size={24} />
            </button>

            {isOpen && (
                <div className="doc-modal-overlay" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }} onClick={() => setIsOpen(false)}>
                    <div className="doc-modal-content" style={{
                        background: 'var(--background)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '600px',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                        animation: 'scaleIn 0.2s ease-out'
                    }} onClick={e => e.stopPropagation()}>

                        <div className="doc-header" style={{
                            padding: '1.25rem',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700 }}>{title}</h2>
                            <button onClick={() => setIsOpen(false)} style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--foreground-secondary)',
                                padding: '0.25rem',
                                display: 'flex'
                            }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div className="doc-body" style={{
                            padding: '1.25rem',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1rem'
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
                                            fontSize: '1rem',
                                            marginBottom: '0.75rem',
                                            color: 'var(--foreground)'
                                        }}>
                                            <Icon size={18} className="text-accent" style={{ color: 'var(--accent)' }} />
                                            <span>{card.title}</span>
                                        </h4>
                                        <p style={{
                                            fontSize: '0.9rem',
                                            lineHeight: '1.5',
                                            color: 'var(--foreground-secondary)',
                                            marginBottom: '0.75rem'
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
                                                        fontSize: '0.85rem',
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
                    </div>
                </div>
            )}
            <style jsx global>{`
                @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                .doc-trigger-btn:hover {
                    transform: scale(1.1);
                }
            `}</style>
        </>
    );
}
