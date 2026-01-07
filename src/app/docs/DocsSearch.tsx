'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, FileText, ChevronRight, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SearchResult {
    title: string;
    href: string;
    excerpt: string;
}

export default function DocsSearch() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const router = useRouter();

    // Toggle search modal with Cmd+K or Ctrl+K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const response = await fetch(`/api/docs/search?q=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();
            setResults(data.results || []);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setIsSearching(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            handleSearch(query);
        }, 300);
        return () => clearTimeout(timer);
    }, [query, handleSearch]);

    const navigateTo = (href: string) => {
        router.push(href);
        setIsOpen(false);
        setQuery('');
    };

    const Highlight = ({ text, query }: { text: string; query: string }) => {
        if (!query.trim()) return <>{text}</>;
        
        // Strip common markdown characters that might be in the title/excerpt
        const cleanText = text.replace(/[#*`_]/g, '');
        const parts = cleanText.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
        
        return (
            <>
                {parts.map((part, i) => 
                    part.toLowerCase() === query.toLowerCase() ? (
                        <mark key={i} style={{ backgroundColor: 'rgba(234, 179, 8, 0.3)', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}>
                            {part}
                        </mark>
                    ) : (
                        <span key={i}>{part}</span>
                    )
                )}
            </>
        );
    };

    return (
        <>
            {/* Search Trigger Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="docs-search-trigger"
                aria-label="Search documentation"
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '250px' }}>
                    <Search size={14} className="docs-search-icon" />
                    <span className="docs-search-text">Search...</span>
                </div>
                <div className="docs-search-shortcut">
                    <span>⌘</span>
                    <span>K</span>
                </div>
            </button>

            {/* Search Modal Backdrop */}
            {isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 100,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        paddingTop: '10vh'
                    }}
                    onClick={() => setIsOpen(false)}
                >
                    {/* Search Modal Content */}
                    <div
                        style={{
                            width: '100%',
                            maxWidth: '600px',
                            backgroundColor: 'var(--background)',
                            borderRadius: '0.75rem',
                            border: '1px solid var(--border)',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            overflow: 'hidden'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Search Input */}
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Search size={20} style={{ color: 'var(--accent)' }} />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Search all documentation..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                style={{
                                    flex: 1,
                                    background: 'transparent',
                                    border: 'none',
                                    outline: 'none',
                                    fontSize: '1rem',
                                    color: 'var(--foreground)'
                                }}
                            />
                            {query && (
                                <button onClick={() => setQuery('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--foreground-secondary)' }}>
                                    <X size={18} />
                                </button>
                            )}
                        </div>

                        {/* Search Results */}
                        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '0.5rem' }}>
                            {isSearching ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-secondary)' }}>
                                    Searching...
                                </div>
                            ) : results.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {results.map((result, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => navigateTo(result.href)}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.25rem',
                                                padding: '0.75rem',
                                                textAlign: 'left',
                                                backgroundColor: 'transparent',
                                                border: 'none',
                                                borderRadius: '0.5rem',
                                                cursor: 'pointer',
                                                transition: 'background-color 0.2s ease',
                                                width: '100%'
                                            }}
                                            className="hover:bg-[var(--background-secondary)]"
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: 'var(--foreground)' }}>
                                                <FileText size={16} style={{ color: 'var(--accent)' }} />
                                                <Highlight text={result.title} query={query} />
                                            </div>
                                            <div style={{ fontSize: '0.8125rem', color: 'var(--foreground-secondary)', paddingLeft: '1.5rem' }}>
                                                <Highlight text={result.excerpt} query={query} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : query ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-secondary)' }}>
                                    No results found for &quot;{query}&quot;
                                </div>
                            ) : (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--foreground-secondary)', fontSize: '0.875rem' }}>
                                    Type to search documentation content...
                                </div>
                            )}
                        </div>

                        {/* Search Footer */}
                        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', backgroundColor: 'var(--background-secondary)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', fontSize: '0.75rem', color: 'var(--foreground-secondary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <kbd style={{ padding: '0.125rem 0.25rem', border: '1px solid var(--border)', borderRadius: '0.25rem', backgroundColor: 'var(--background)' }}>Esc</kbd>
                                <span>to close</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
