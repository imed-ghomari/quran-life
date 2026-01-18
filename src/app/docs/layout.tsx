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
        <div className="docs-container">
            {/* Top Navigation / Breadcrumbs Bar */}
            <header className="docs-header" style={{ 
                borderBottom: 'none',
                display: 'flex',
                gap: '1.5rem',
                padding: '0 1.5rem',
                maxWidth: '100%',
                margin: '0 auto',
                width: '100%',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, width: '280px', flexShrink: 0 }}>
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

                <div className="hidden md:flex flex-1 items-center min-w-0 h-full">
                     <DocsSearch className="!w-full !max-w-none !justify-start px-4 py-2 !h-10 !bg-[var(--background-secondary)] !border-[var(--border)] !rounded-[16px] hover:!shadow-none transition-all" />
                </div>
                
                <div className="hidden xl:block" style={{ width: '280px', flexShrink: 0 }} />

                <div className="md:hidden" style={{ marginLeft: 'auto' }}>
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
                <aside className="card modern-card custom-scrollbar hidden md:block" style={{ 
                    width: '280px', 
                    border: '1px solid var(--border)',
                    height: '100%',
                    padding: '0',
                    borderRadius: '16px'
                }}>
                    <nav style={{ padding: '1.5rem 1rem' }}>
                        <SidebarNav items={sidebarItems} />
                    </nav>
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
                    {/* Content */}
                    <main className="docs-main custom-scrollbar card modern-card flex-1 !border-[var(--border)]" style={{ 
                        height: '100%', 
                        overflowY: 'auto',
                        padding: '0',
                        borderRadius: '16px'
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
                <div className="hidden xl:block card modern-card custom-scrollbar" style={{ 
                    width: '280px', 
                    border: '1px solid var(--border)',
                    height: '100%',
                    padding: '0',
                    borderRadius: '16px'
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
