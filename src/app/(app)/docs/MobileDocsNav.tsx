'use client';

import { useState, ReactNode } from 'react';
import { Menu, X, ChevronRight, ChevronDown } from 'lucide-react';
import SidebarLink from './SidebarLink';
import SidebarNav, { SidebarItem } from './SidebarNav';

export default function MobileDocsNav({ items }: { items: SidebarItem[] }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '0.5rem',
                    color: 'var(--foreground)',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                {isOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            {isOpen && (
                <div 
                  style={{
                    position: 'fixed',
                    inset: 0,
                    top: '3.5rem', /* Account for docs header */
                    zIndex: 12000,
                    backgroundColor: 'var(--background)',
                    overflowY: 'auto',
                    padding: '1.5rem',
                    paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
                    animation: 'fadeUp 0.2s ease'
                  }}
                >
                    <nav>
                        <SidebarNav items={items} onLinkClick={() => setIsOpen(false)} />
                    </nav>
                </div>
            )}
        </>
    );
}
