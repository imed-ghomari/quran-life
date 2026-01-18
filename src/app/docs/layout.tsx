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
        <div className="docs-container" style={{ backgroundColor: 'var(--landing-bg-secondary)' }}>
            {/* Top Navigation / Breadcrumbs Bar */}
            <header className="docs-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                    <div className="md:hidden">
                        <MobileDocsNav items={sidebarItems} />
                    </div>
                    <div className="md:hidden">
                        <DocsBreadcrumbs />
                    </div>
                    <div className="hidden md:block">
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Documentation</h1>
                    </div>
                </div>
                
                <div className="md:hidden" style={{ marginLeft: '1rem' }}>
                    <DocsSearch />
                </div>
            </header>

            <div style={{ 
                display: 'flex', 
                flex: 1, 
                overflow: 'hidden', 
                position: 'relative',
                gap: '1.5rem',
                padding: '1.5rem',
                maxWidth: '100%',
                margin: '0 auto'
            }}>
                {/* Desktop Sidebar */}
                <aside className="roadmap-card custom-scrollbar hidden md:block" style={{ 
                    width: '280px', 
                    border: '1px solid var(--border)',
                    height: '100%',
                    padding: '0',
                    background: 'var(--background)'
                }}>
                    <nav style={{ padding: '1.5rem 1rem' }}>
                        <SidebarNav items={sidebarItems} />
                    </nav>
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col gap-6 min-w-0 h-full overflow-hidden">
                    {/* Search Bar - Desktop */}
                    <div className="hidden md:block w-full">
                        <DocsSearch className="!w-full !justify-start px-4 py-3 !h-auto !bg-[var(--background)] !border-[var(--border)] !rounded-[var(--radius-md)] hover:!shadow-sm transition-all" />
                    </div>

                    {/* Content */}
                    <main className="docs-main custom-scrollbar roadmap-card flex-1 !border-[var(--border)]" style={{ 
                        height: 'auto', 
                        overflowY: 'auto',
                        padding: '0',
                        background: 'var(--background)'
                    }}>
                        <article className="docs-content">
                            <Suspense fallback={null}>
                                <SearchHighlight />
                            </Suspense>
                            {children}
                        </article>
                    </main>
                </div>

                {/* Table of Contents Sidebar */}
                <div className="hidden xl:block roadmap-card custom-scrollbar" style={{ 
                    width: '280px', 
                    border: '1px solid var(--border)',
                    height: '100%',
                    padding: '0',
                    background: 'var(--background)'
                }}>
                    <div style={{ padding: '2rem 1.5rem' }}>
                        <TableOfContents />
                    </div>
                </div>

                <BackToTop />
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
