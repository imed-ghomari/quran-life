'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface TocItem {
    id: string;
    text: string;
    level: number;
}

export default function TableOfContents() {
    const [headings, setHeadings] = useState<TocItem[]>([]);
    const [activeId, setActiveId] = useState<string>('');
    const pathname = usePathname();

    useEffect(() => {
        // Reset headings on pathname change to avoid stale content
        setHeadings([]);
        
        // Use a small delay to ensure MDX content is rendered
        const timer = setTimeout(() => {
            const article = document.querySelector('article');
            if (!article) return;

            const updateHeadings = () => {
                const elements = Array.from(article.querySelectorAll('h2, h3'))
                    .map((elem) => ({
                        id: elem.id || elem.textContent?.toLowerCase().replace(/\s+/g, '-') || '',
                        text: elem.textContent || '',
                        level: Number(elem.tagName.charAt(1)),
                    }));
                
                // Ensure elements have IDs for linking
                article.querySelectorAll('h2, h3').forEach((elem) => {
                    if (!elem.id) {
                        elem.id = elem.textContent?.toLowerCase().replace(/\s+/g, '-') || '';
                    }
                });

                setHeadings(elements);
            };

            // Update headings initially
            updateHeadings();

            // Also update when mutations occur (for dynamic content)
            const mutationObserver = new MutationObserver(updateHeadings);
            mutationObserver.observe(article, { childList: true, subtree: true });

            const intersectionObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            setActiveId(entry.target.id);
                        }
                    });
                },
                { rootMargin: '0px 0px -80% 0px' }
            );

            article.querySelectorAll('h2, h3').forEach((elem) => intersectionObserver.observe(elem));

            return () => {
                mutationObserver.disconnect();
                intersectionObserver.disconnect();
            };
        }, 100);

        return () => clearTimeout(timer);
    }, [pathname]);

    return (
        <aside className="custom-scrollbar" style={{ height: '100%' }}>
            {headings.length > 0 ? (
                <>
                    <div style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 'bold', 
                        color: 'var(--foreground-secondary)', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.1em', 
                        marginBottom: '1rem' 
                    }}>
                        On this page
                    </div>
                    <nav>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {headings.map((heading) => (
                                <li key={heading.id} style={{ marginBottom: '0.5rem' }}>
                                    <a
                                        href={`#${heading.id}`}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth' });
                                        }}
                                        style={{
                                            display: 'block',
                                            fontSize: heading.level === 2 ? '0.875rem' : '0.8125rem',
                                            paddingLeft: heading.level === 2 ? '0' : '1rem',
                                            color: activeId === heading.id ? 'var(--accent)' : 'var(--foreground-secondary)',
                                            textDecoration: 'none',
                                            transition: 'color 0.2s ease',
                                            fontWeight: activeId === heading.id ? '500' : '400',
                                        }}
                                    >
                                        {heading.text}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </>
            ) : (
                <div style={{
                    fontSize: '0.8125rem',
                    color: 'var(--foreground-secondary)',
                    lineHeight: '1.4'
                }}>
                    There is no heading in this file.
                </div>
            )}
        </aside>
    );
}
