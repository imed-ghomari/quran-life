'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function SearchHighlight() {
    const searchParams = useSearchParams();
    const highlight = searchParams.get('highlight');

    useEffect(() => {
        if (!highlight) return;

        const term = decodeURIComponent(highlight).toLowerCase();
        if (!term) return;

        // Give the page a moment to render content
        const timer = setTimeout(() => {
            const article = document.querySelector('article.docs-content');
            if (!article) return;

            // Simple text replacement within the article for the search term
            // We use a tree walker to find text nodes and wrap the matches
            const walker = document.createTreeWalker(
                article,
                NodeFilter.SHOW_TEXT,
                null
            );

            const nodesToProcess: Text[] = [];
            let currentNode = walker.nextNode();
            while (currentNode) {
                if (currentNode.parentElement?.tagName !== 'SCRIPT' && 
                    currentNode.parentElement?.tagName !== 'STYLE' &&
                    currentNode.textContent?.toLowerCase().includes(term)) {
                    nodesToProcess.push(currentNode as Text);
                }
                currentNode = walker.nextNode();
            }

            nodesToProcess.forEach(node => {
                const text = node.textContent || '';
                const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
                
                if (parts.length > 1) {
                    const fragment = document.createDocumentFragment();
                    parts.forEach(part => {
                        if (part.toLowerCase() === term) {
                            const span = document.createElement('span');
                            span.className = 'search-highlight';
                            span.textContent = part;
                            fragment.appendChild(span);
                        } else if (part) {
                            fragment.appendChild(document.createTextNode(part));
                        }
                    });
                    node.parentNode?.replaceChild(fragment, node);
                }
            });
        }, 300);

        return () => clearTimeout(timer);
    }, [highlight]);

    return null;
}
