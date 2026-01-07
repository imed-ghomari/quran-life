import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface SearchResult {
    title: string;
    href: string;
    excerpt: string;
}

interface MetaData {
    [key: string]: string | { title: string; type?: string };
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
            const lowerContent = content.toLowerCase();
            const lowerQuery = query.toLowerCase();

            if (lowerContent.includes(lowerQuery)) {
                const title = getTitleFromMeta(dirPath, file);
                const href = `${baseRoute}/${file.replace(/\.mdx$/, '')}`.replace(/\/index$/, '');
                const finalBaseHref = href === '/docs/index' ? '/docs' : (href || '/docs');

                // Extract a clean excerpt
                const index = lowerContent.indexOf(lowerQuery);
                const anchor = getNearestHeadingAnchor(content, index);
                const finalHref = `${finalBaseHref}${anchor}`;

                const start = Math.max(0, index - 40);
                const end = Math.min(content.length, index + lowerQuery.length + 80);
                let excerpt = content.substring(start, end)
                    .replace(/[#*`]/g, '') // Remove markdown symbols
                    .replace(/\n/g, ' ')   // Remove newlines
                    .trim();
                
                if (start > 0) excerpt = '...' + excerpt;
                if (end < content.length) excerpt = excerpt + '...';

                results.push({
                    title,
                    href: finalHref,
                    excerpt
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

    // Sort by relevance (exact title matches first, then content matches)
    const sortedResults = results.sort((a, b) => {
        const aTitleMatch = a.title.toLowerCase().includes(query.toLowerCase());
        const bTitleMatch = b.title.toLowerCase().includes(query.toLowerCase());
        if (aTitleMatch && !bTitleMatch) return -1;
        if (!aTitleMatch && bTitleMatch) return 1;
        return 0;
    }).slice(0, 10); // Limit to top 10 results

    return NextResponse.json({ results: sortedResults });
}
