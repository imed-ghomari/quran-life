'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';

export default function SearchHighlight() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const highlight = searchParams.get('highlight');
    const observerRef = useRef<MutationObserver | null>(null);

    useEffect(() => {
        if (!highlight) return;

        const rawTerm = decodeURIComponent(highlight).trim();
        if (!rawTerm) return;
        const terms = Array.from(new Set(rawTerm.toLowerCase().split(/\s+/).filter(Boolean)));
        if (terms.length === 0) return;

        // Cleanup any previous observer
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }

        const processAndScroll = () => {
            const article = document.querySelector('article.docs-content');
            if (!article) return false;

            // Check if article has meaningful content (not just empty or loading)
            // Look for text that contains our search term
            const articleText = article.textContent?.toLowerCase() || '';
            if (!terms.some(term => articleText.includes(term))) {
                console.log('SearchHighlight: Term not found in article yet, waiting...', { terms });
                return false;
            }

            console.log('SearchHighlight: Found term in article, processing...');

            // First, remove any existing highlights to avoid double highlighting or stale matches
            const existingHighlights = article.querySelectorAll('.search-highlight');
            existingHighlights.forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                }
            });
            article.normalize(); // Merge adjacent text nodes

            // Simple text replacement within the article for the search term
            const walker = document.createTreeWalker(
                article,
                NodeFilter.SHOW_TEXT,
                null
            );

            const nodesToProcess: Text[] = [];
            let currentNode = walker.nextNode();
            while (currentNode) {
                if (currentNode.nodeType === Node.TEXT_NODE) {
                    const textNode = currentNode as Text;
                    if (textNode.parentElement?.tagName !== 'SCRIPT' &&
                        textNode.parentElement?.tagName !== 'STYLE' &&
                        terms.some(term => textNode.textContent?.toLowerCase().includes(term))) {
                        nodesToProcess.push(textNode);
                    }
                }
                currentNode = walker.nextNode();
            }

            nodesToProcess.forEach(node => {
                const text = node.textContent || '';
                const escapedTerms = terms
                    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                    .join('|');
                const parts = text.split(new RegExp(`(${escapedTerms})`, 'gi'));

                if (parts.length > 1) {
                    const fragment = document.createDocumentFragment();
                    parts.forEach(part => {
                        if (terms.includes(part.toLowerCase())) {
                            const span = document.createElement('span');
                            span.className = 'search-highlight';
                            span.style.backgroundColor = 'rgba(234, 179, 8, 0.4)';
                            span.style.color = 'inherit';
                            span.style.borderRadius = '2px';
                            span.style.padding = '0 1px';
                            span.textContent = part;
                            fragment.appendChild(span);
                        } else if (part) {
                            fragment.appendChild(document.createTextNode(part));
                        }
                    });
                    node.parentNode?.replaceChild(fragment, node);
                }
            });

            // Now scroll to the first highlight
            const firstHighlight = article.querySelector('.search-highlight') as HTMLElement;
            const container = document.querySelector('.docs-main') as HTMLElement;

            if (firstHighlight && container) {
                // Calculate and scroll after layout update
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const containerRect = container.getBoundingClientRect();
                        const highlightRect = firstHighlight.getBoundingClientRect();
                        const highlightOffset = highlightRect.top - containerRect.top + container.scrollTop;
                        const targetScroll = highlightOffset - (containerRect.height / 2) + (highlightRect.height / 2);

                        console.log('SearchHighlight: Scrolling to highlight', {
                            highlightOffset,
                            targetScroll,
                            containerHeight: containerRect.height
                        });

                        container.scrollTo({
                            top: Math.max(0, targetScroll),
                            behavior: 'smooth'
                        });
                    }, 50);
                });
            }

            return true;
        };

        // Try immediately first (in case content is already loaded)
        const initialDelay = setTimeout(() => {
            if (processAndScroll()) {
                console.log('SearchHighlight: Processed on initial attempt');
                return;
            }

            // If content not ready, set up a MutationObserver to wait for it
            console.log('SearchHighlight: Setting up MutationObserver to wait for content');
            const article = document.querySelector('article.docs-content');
            if (!article) {
                console.warn('SearchHighlight: Article element not found');
                return;
            }

            let attempts = 0;
            const maxAttempts = 20; // Max 4 seconds (20 * 200ms)

            observerRef.current = new MutationObserver(() => {
                attempts++;
                console.log('SearchHighlight: Content changed, attempt', attempts);

                if (processAndScroll()) {
                    console.log('SearchHighlight: Successfully processed after mutation');
                    observerRef.current?.disconnect();
                    observerRef.current = null;
                } else if (attempts >= maxAttempts) {
                    console.warn('SearchHighlight: Max attempts reached, giving up');
                    observerRef.current?.disconnect();
                    observerRef.current = null;
                }
            });

            observerRef.current.observe(article, {
                childList: true,
                subtree: true,
                characterData: true
            });

            // Also set up a polling mechanism as backup
            let pollAttempts = 0;
            const pollInterval = setInterval(() => {
                pollAttempts++;
                if (processAndScroll()) {
                    console.log('SearchHighlight: Successfully processed via polling');
                    clearInterval(pollInterval);
                    observerRef.current?.disconnect();
                    observerRef.current = null;
                } else if (pollAttempts >= maxAttempts) {
                    console.warn('SearchHighlight: Polling max attempts reached');
                    clearInterval(pollInterval);
                }
            }, 200);

            // Cleanup interval on unmount
            return () => clearInterval(pollInterval);
        }, 100);

        return () => {
            clearTimeout(initialDelay);
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
        };
    }, [highlight, pathname]);

    return null;
}
