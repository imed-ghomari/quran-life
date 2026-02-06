import fs from 'fs';
import path from 'path';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import { mdxComponents } from '../mdx-components';
import MindmapDocHeader from '../MindmapDocHeader';

interface PageProps {
    params: Promise<{
        slug: string[];
    }>;
}

export default async function Page({ params }: PageProps) {
    const { slug } = await params;
    const slugPath = slug.join('/');
    const contentDir = path.join(process.cwd(), 'content');
    
    // Try to find the file: slug.mdx, slug/index.mdx
    let filePath = path.join(contentDir, `${slugPath}.mdx`);
    
    if (!fs.existsSync(filePath)) {
        filePath = path.join(contentDir, slugPath, 'index.mdx');
    }

    if (!fs.existsSync(filePath)) {
        notFound();
    }

    const source = fs.readFileSync(filePath, 'utf8');

    return (
        <div className="w-full">
            {(slugPath.startsWith('mindmaps/surah-') || slugPath.startsWith('mindmaps/part-')) && (
                <MindmapDocHeader slug={slugPath} />
            )}
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

export async function generateStaticParams() {
    const contentDir = path.join(process.cwd(), 'content');
    const files = getAllFiles(contentDir);
    
    return files
        .filter(file => file !== 'index.mdx') // Skip root index.mdx as it's handled by app/(app)/docs/page.tsx
        .map(file => {
            const slug = file.replace(/\.mdx$/, '').split(path.sep);
            // Handle directory index files (e.g., "mindmaps/index.mdx" -> ["mindmaps"])
            if (slug[slug.length - 1] === 'index') {
                slug.pop();
            }
            return { slug };
        })
        .filter(item => item.slug.length > 0);
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.mdx')) {
                const relativePath = path.relative(path.join(process.cwd(), 'content'), path.join(dirPath, file));
                arrayOfFiles.push(relativePath);
            }
        }
    });

    return arrayOfFiles;
}
