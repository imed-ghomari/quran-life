'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, FileText, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { performSearch, SearchDocument, SearchResult } from '@/lib/searchClient';

export default function DocsSearch({ className }: { className?: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchIndex, setSearchIndex] = useState<SearchDocument[] | null>(null);
    const router = useRouter();
    const indexLoaded = useRef(false);

    // Load search index on first open or mount (lazy load to save bandwidth if needed, 
    // but small enough to load on mount or first interaction)
    const loadIndex = async () => {
        if (indexLoaded.current) return;
        try {
            const res = await fetch('/search-index.json');
            if (res.ok) {
                const data = await res.json();
                setSearchIndex(data);
                indexLoaded.current = true;
            } else {
                console.error('Failed to load search index');
            }
        } catch (e) {
            console.error('Error loading search index:', e);
        }
    };

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

    // Load index when modal opens
    useEffect(() => {
        if (isOpen) {
            loadIndex();
        }
    }, [isOpen]);

    const handleSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        setIsSearching(true);
        try {
            if (!searchIndex && !indexLoaded.current) {
                await loadIndex();
            }

            // Wait a bit for index to set if it was just loaded
            // But since we await loadIndex(), if it updates state, we might need to access the ref or wait for re-render
            // Actually, we can pass the data directly if we modify loadIndex to return it.
            // For now, let's assume if indexLoaded is true, searchIndex might be in next render cycle if we just set it.
            // Better to return data from loadIndex.

            let docs = searchIndex;
            if (!docs) {
                const res = await fetch('/search-index.json');
                docs = await res.json();
                setSearchIndex(docs);
                indexLoaded.current = true;
            }

            if (docs) {
                // Exclude the "Index" page from search results
                const filteredDocs = docs.filter(doc => doc.title !== 'Index');
                const searchResults = performSearch(filteredDocs, searchQuery);
                setResults(searchResults.slice(0, 10)); // Limit to 10
            }
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setIsSearching(false);
        }
    }, [searchIndex]);

    useEffect(() => {
        const timer = setTimeout(() => {
            handleSearch(query);
        }, 300);
        return () => clearTimeout(timer);
    }, [query, handleSearch]);

    const navigateTo = (href: string) => {
        const term = query.trim();
        let finalHref = href;
        
        if (term) {
            const [url, hash] = href.split('#');
            const separator = url.includes('?') ? '&' : '?';
            finalHref = `${url}${separator}highlight=${encodeURIComponent(term)}${hash ? '#' + hash : ''}`;
        }

        router.push(finalHref, { scroll: false });
        setIsOpen(false);
        setQuery('');
    };

    const Highlight = ({ text, query }: { text: string; query: string }) => {
        if (!query.trim()) return <>{text}</>;

        // Strip common markdown characters
        const cleanText = text.replace(/[#*`_]/g, '');

        // Split query into words and escape them for regex
        const words = query.trim().split(/\s+/).filter(word => word.length > 1);

        if (words.length === 0) {
            // Fallback for single characters or empty queries
            const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const parts = cleanText.split(new RegExp(`(${escapedQuery})`, 'gi'));
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
        }

        // Create a regex that matches any of the words
        const pattern = words
            .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|');

        const parts = cleanText.split(new RegExp(`(${pattern})`, 'gi'));
        const wordSet = new Set(words.map(w => w.toLowerCase()));

        return (
            <>
                {parts.map((part, i) =>
                    wordSet.has(part.toLowerCase()) || part.toLowerCase() === query.toLowerCase() ? (
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
                className={`docs-search-trigger ${className || ''}`}
                aria-label="Search documentation"
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                    id="docs-search-modal"
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
                                suppressHydrationWarning={true}
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
