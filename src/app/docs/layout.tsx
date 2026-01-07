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

export default function DocsLayout({ children }: { children: ReactNode }) {
    const contentDir = path.join(process.cwd(), 'content');
    const sidebarItems = getSidebarData(contentDir);

    return (
        <div className="docs-container">
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
                
                <div style={{ marginLeft: '1rem' }}>
                    <DocsSearch />
                </div>
            </header>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
                {/* Desktop Sidebar */}
                <aside className="docs-sidebar custom-scrollbar">
                    <nav style={{ padding: '1.5rem 1rem' }}>
                        <SidebarNav items={sidebarItems} />
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="docs-main custom-scrollbar">
                    <article className="docs-content">
                        <Suspense fallback={null}>
                            <SearchHighlight />
                        </Suspense>
                        {children}
                    </article>
                </main>

                {/* Table of Contents Sidebar */}
                <TableOfContents />

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
