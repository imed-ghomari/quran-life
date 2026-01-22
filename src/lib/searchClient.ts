export interface SearchResult {
    title: string;
    href: string;
    excerpt: string;
    score?: number;
}

export interface SearchDocument {
    title: string;
    href: string;
    content: string;
}

export function fuzzyMatch(text: string, query: string): { matches: boolean; score: number; index: number } {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // 1. Exact match (highest score)
    const exactIndex = lowerText.indexOf(lowerQuery);
    if (exactIndex !== -1) {
        return { matches: true, score: 100, index: exactIndex };
    }

    // 2. All words present (high score)
    const words = lowerQuery.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
        const allWordsPresent = words.every(word => lowerText.includes(word));
        if (allWordsPresent) {
            // Find the index of the first word
            const firstWordIndex = lowerText.indexOf(words[0]);
            return { matches: true, score: 80, index: firstWordIndex };
        }
    }

    // 3. Simple character-skipping fuzzy (medium score)
    if (lowerQuery.length > 2) {
        // Create a regex like f.*u.*z.*z.*y
        const fuzzyPattern = lowerQuery.split('').map(char =>
            char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape special chars
        ).join('.*');
        const fuzzyRegex = new RegExp(fuzzyPattern, 'i');
        const match = lowerText.match(fuzzyRegex);
        if (match) {
            return { matches: true, score: 50, index: match.index || 0 };
        }
    }

    return { matches: false, score: 0, index: -1 };
}

export function getNearestHeadingAnchor(content: string, matchIndex: number): string {
    const contentBeforeMatch = content.substring(0, matchIndex);
    // Matches markdown headings like ## Heading or ### Heading
    const headingRegex = /^###?\s+(.+)$/gm;
    let lastAnchor = '';
    let match;

    while ((match = headingRegex.exec(contentBeforeMatch)) !== null) {
        const headingText = match[1].trim();
        lastAnchor = headingText.toLowerCase().replace(/\s+/g, '-');
    }

    return lastAnchor ? `#${lastAnchor}` : '';
}

export function performSearch(documents: SearchDocument[], query: string): SearchResult[] {
    const results: SearchResult[] = [];
    
    for (const doc of documents) {
        // Search in both title and content
        const titleMatch = fuzzyMatch(doc.title, query);
        const contentMatch = fuzzyMatch(doc.content, query);

        if (titleMatch.matches || contentMatch.matches) {
            // Boost title matches
            const score = Math.max(titleMatch.score, contentMatch.score) + (titleMatch.matches ? 10 : 0);
            
            // Extract a clean excerpt
            const index = contentMatch.matches ? contentMatch.index : 0;
            const anchor = getNearestHeadingAnchor(doc.content, index);
            const finalHref = `${doc.href}${anchor}`;

            const start = Math.max(0, index - 40);
            const end = Math.min(doc.content.length, index + query.length + 80);
            let excerpt = doc.content.substring(start, end)
                .replace(/[#*`]/g, '') // Remove markdown symbols
                .replace(/\n/g, ' ')   // Remove newlines
                .trim();

            if (start > 0) excerpt = '...' + excerpt;
            if (end < doc.content.length) excerpt = excerpt + '...';

            results.push({
                title: doc.title,
                href: finalHref,
                excerpt,
                score
            });
        }
    }

    // Sort results by score (descending)
    return results.sort((a, b) => (b.score || 0) - (a.score || 0));
}
