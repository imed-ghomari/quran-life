import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface SearchResult {
    title: string;
    href: string;
    excerpt: string;
    score?: number;
}

interface MetaData {
    [key: string]: string | { title: string; type?: string };
}

function fuzzyMatch(text: string, query: string): { matches: boolean; score: number; index: number } {
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

function getTitleFromMeta(dirPath: string, fileName: string): string {
    const metaPath = path.join(dirPath, '_meta.json');
    if (fs.existsSync(metaPath)) {
        try {
            const meta: MetaData = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const key = fileName.replace(/\.mdx$/, '');
            const value = meta[key];
            if (value) {
                return typeof value === 'string' ? value : value.title;
            }
        } catch (e) {
            console.error('Error reading meta file:', metaPath);
        }
    }
    return fileName.replace(/\.mdx$/, '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function getNearestHeadingAnchor(content: string, matchIndex: number): string {
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

function searchFiles(dirPath: string, query: string, baseRoute = '/docs'): SearchResult[] {
    const results: SearchResult[] = [];
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
        if (file.startsWith('_') || file.startsWith('.')) continue;

        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            results.push(...searchFiles(fullPath, query, `${baseRoute}/${file}`));
        } else if (file.endsWith('.mdx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const title = getTitleFromMeta(dirPath, file);
            
            // Search in both title and content
            const titleMatch = fuzzyMatch(title, query);
            const contentMatch = fuzzyMatch(content, query);
            
            if (titleMatch.matches || contentMatch.matches) {
                const bestMatch = titleMatch.score >= contentMatch.score ? titleMatch : contentMatch;
                const href = `${baseRoute}/${file.replace(/\.mdx$/, '')}`.replace(/\/index$/, '');
                const finalBaseHref = href === '/docs/index' ? '/docs' : (href || '/docs');

                // Extract a clean excerpt
                const index = contentMatch.matches ? contentMatch.index : 0;
                const anchor = getNearestHeadingAnchor(content, index);
                const finalHref = `${finalBaseHref}${anchor}`;

                const start = Math.max(0, index - 40);
                const end = Math.min(content.length, index + query.length + 80);
                let excerpt = content.substring(start, end)
                    .replace(/[#*`]/g, '') // Remove markdown symbols
                    .replace(/\n/g, ' ')   // Remove newlines
                    .trim();
                
                if (start > 0) excerpt = '...' + excerpt;
                if (end < content.length) excerpt = excerpt + '...';

                results.push({
                    title,
                    href: finalHref,
                    excerpt,
                    score: Math.max(titleMatch.score, contentMatch.score) + (titleMatch.matches ? 10 : 0) // Boost title matches
                });
            }
        }
    }

    return results;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
        return NextResponse.json({ results: [] });
    }

    const contentDir = path.join(process.cwd(), 'content');
    const results = searchFiles(contentDir, query);

    // Sort results by score (descending)
    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    return NextResponse.json({ results: results.slice(0, 10) });
}
