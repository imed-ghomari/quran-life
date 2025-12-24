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

export default function HelpSection({ title = "Documentation & Help", cards }: HelpSectionProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="help-container">
            <div className="help-header" onClick={() => setIsOpen(!isOpen)}>
                <h3>
                    <HelpCircle size={20} className="text-accent" />
                    <span>{title}</span>
                </h3>
                <ChevronDown
                    size={20}
                    style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.3s ease',
                        color: 'var(--foreground-secondary)'
                    }}
                />
            </div>

            {isOpen && (
                <div className="help-content">
                    {cards.map((card, idx) => {
                        const Icon = card.icon;
                        return (
                            <div key={idx} className="help-card">
                                <h4>
                                    <Icon size={18} />
                                    <span>{card.title}</span>
                                </h4>
                                <p>{card.description}</p>
                                {card.items && card.items.length > 0 && (
                                    <ul>
                                        {card.items.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
