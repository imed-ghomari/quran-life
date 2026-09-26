import fs from 'fs';
import path from 'path';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import { mdxComponents } from './mdx-components';

export const dynamic = 'force-dynamic';

export default async function DocsIndexPage() {
    const contentDir = path.join(process.cwd(), 'content');
    const filePath = path.join(contentDir, 'index.mdx');

    if (!fs.existsSync(filePath)) {
        notFound();
    }

    const source = fs.readFileSync(filePath, 'utf8');

    return (
        <div className="w-full">
            <article className="prose prose-slate dark:prose-invert max-w-none
                prose-headings:text-[var(--foreground)] 
                prose-p:text-[var(--foreground)] 
                prose-a:text-[var(--accent)] hover:prose-a:underline
                prose-strong:text-[var(--foreground)]
                prose-ul:text-[var(--foreground)]
                prose-ol:text-[var(--foreground)]
                prose-li:text-[var(--foreground)]
                prose-hr:border-[var(--border)]
                prose-blockquote:border-[var(--accent)]
                prose-blockquote:text-[var(--foreground-secondary)]">
                <MDXRemote source={source} components={mdxComponents} />
            </article>
        </div>
    );
}
