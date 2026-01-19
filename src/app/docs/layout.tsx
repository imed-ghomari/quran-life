import fs from 'fs';
import path from 'path';
import { ReactNode, Suspense } from 'react';
import MobileDocsNav from './MobileDocsNav';
import SidebarNav, { SidebarItem } from './SidebarNav';
import TableOfContents from './TableOfContents';
import DocsSearch from './DocsSearch';
import DocsBreadcrumbs from './DocsBreadcrumbs';
import BackToTop from './BackToTop';
import SearchHighlight from './SearchHighlight';
import { ScrollOnNavigate } from './ScrollOnNavigate';

function getSidebarData(dirPath: string, baseRoute = '/docs'): SidebarItem[] {
    const metaPath = path.join(dirPath, '_meta.json');
    let meta: Record<string, string | { title: string; type?: string }> = {};
    
    if (fs.existsSync(metaPath)) {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }

    const items: SidebarItem[] = [];

    // Process meta items to maintain order
    Object.entries(meta).forEach(([key, value]) => {
        const itemPath = path.join(dirPath, key);
        const title = typeof value === 'string' ? value : value.title;
        const href = `${baseRoute}/${key}`.replace(/\/index$/, '');
        const finalHref = href === '/docs/index' ? '/docs' : href;

        if (fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()) {
            items.push({
                title,
                href: finalHref,
                children: getSidebarData(itemPath, href),
            });
        } else if (fs.existsSync(`${itemPath}.mdx`)) {
            items.push({
                title,
                href: finalHref,
            });
        }
    });

    return items;
}

import '@/components/LandingPage/RoadmapSection.css';

export default function DocsLayout({ children }: { children: ReactNode }) {
    const contentDir = path.join(process.cwd(), 'content');
    const sidebarItems = getSidebarData(contentDir);

    return (
        <div className="content-wrapper !max-w-full h-full flex flex-col">
            <ScrollOnNavigate />
            {/* Mobile Header */}
            <div className="flex items-center justify-between mb-4 shrink-0 md:hidden px-5 pt-5">
                <div className="flex items-center gap-3">
                    <MobileDocsNav items={sidebarItems} />
                    <DocsBreadcrumbs />
                </div>
                <DocsSearch />
            </div>

            {/* Desktop Title */}
            <h1 className="hidden md:block text-2xl font-bold mb-6 flex-shrink-0">Documentation</h1>

            <div style={{ 
                display: 'flex', 
                flex: 1, 
                overflow: 'hidden', 
                position: 'relative',
                gap: '1.5rem',
                maxWidth: '100%',
                margin: '0 auto',
                width: '100%'
            }}>
                {/* Desktop Sidebar */}
                <aside className="card modern-card custom-scrollbar hidden md:block !mb-0" style={{ 
                    width: '280px', 
                    border: '1px solid var(--border)',
                    height: '100%',
                    padding: '0',
                    borderRadius: '16px',
                    overflowY: 'auto',
                    flexShrink: 0
                }}>
                    <div style={{ padding: '1.5rem' }}>
                        <SidebarNav items={sidebarItems} />
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
                    {/* Content */}
                    <main className="docs-main custom-scrollbar card modern-card flex-1 !border-[var(--border)] !mb-0" style={{ 
                        height: '100%', 
                        overflowY: 'auto',
                        padding: '0',
                        borderRadius: '16px'
                    }}>
                        <article className="docs-content p-5 md:p-6">
                            <Suspense fallback={null}>
                                <SearchHighlight />
                            </Suspense>
                            {children}
                        </article>
                    </main>
                </div>

                {/* Desktop Table of Contents */}
                <aside className="hidden lg:flex flex-col gap-4 h-full" style={{ width: '280px', flexShrink: 0 }}>
                    <DocsSearch className="!w-full !max-w-none !justify-start px-4 py-2 !h-10 !bg-[var(--background-secondary)] !border-[var(--border)] !rounded-[16px] hover:!shadow-none transition-all flex-shrink-0" />
                    <div className="card modern-card custom-scrollbar !mb-0" style={{ 
                        border: '1px solid var(--border)',
                        flex: 1,
                        padding: '1.5rem',
                        borderRadius: '16px',
                        overflowY: 'auto'
                    }}>
                         <TableOfContents />
                    </div>
                </aside>
            </div>
        </div>
    );
}

function ChevronDown({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6"/>
        </svg>
    );
}
