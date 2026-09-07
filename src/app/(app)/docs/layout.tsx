import fs from 'fs';
import path from 'path';
import { ReactNode, Suspense } from 'react';

export const dynamic = 'force-dynamic';
import MobileDocsNav from './MobileDocsNav';
import SidebarNav, { SidebarItem } from './SidebarNav';
import TableOfContents from './TableOfContents';
import DocsBreadcrumbs from './DocsBreadcrumbs';
import { ScrollOnNavigate } from './ScrollOnNavigate';
import { DocsNavigationProvider } from './DocsNavigationState';
import DocsContentShell from './DocsContentShell';

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
        <DocsNavigationProvider>
            <div className="content-wrapper !max-w-full h-full flex flex-col">
                <Suspense fallback={null}>
                    <ScrollOnNavigate />
                </Suspense>
            
            {/* Mobile Header */}
<div className="flex items-center justify-between shrink-0 md:hidden px-5 pt-5">
                <div className="flex items-center gap-3">
                    <MobileDocsNav items={sidebarItems} />
                    <DocsBreadcrumbs />
                </div>
            </div>
            <div className="md:hidden" style={{ height: '16px' }} />

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
                    width: '260px',
                    border: '1px solid var(--border)',
                    height: '100%',
                    padding: '0',
                    borderRadius: '16px',
                    overflowY: 'auto',
                    flex: '0 0 260px'
                }}>
                    <div style={{ padding: '1.5rem' }}>
                        <SidebarNav items={sidebarItems} />
                    </div>
                </aside>

                {/* Main Content Area */}
<div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative md:mt-0" style={{ flex: '1.2 1 0%' }}>
                    {/* Content */}
              <main className="docs-main custom-scrollbar card modern-card flex-1 !border-[var(--border)] !mb-0 mx-4 md:mx-0 mt-10 md:mt-0" style={{
    height: '100%',
    overflowY: 'auto',
    padding: '0',
    borderRadius: '16px'
}}>
                    <article className="docs-content p-5 pt-6 md:p-6 md:pt-6">
                        <DocsContentShell>{children}</DocsContentShell>
                    </article>
                    </main>
                </div>

                {/* Desktop Table of Contents */}
                <aside className="hidden lg:flex flex-col gap-4 h-full" style={{ width: '260px', flex: '0 0 260px' }}>
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
        </DocsNavigationProvider>
    );
}

function ChevronDown({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}
