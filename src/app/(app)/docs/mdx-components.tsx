import Link from 'next/link';
import type { MDXComponents } from 'mdx/types';

export const mdxComponents: MDXComponents = {
    a: ({ href, children, ...props }: any) => {
        if (href?.startsWith('/') || href?.startsWith('./') || href?.startsWith('../')) {
            return (
                <Link href={href} className="text-[var(--accent)] hover:underline" {...props}>
                    {children}
                </Link>
            );
        }
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline" {...props}>
                {children}
            </a>
        );
    },
    h1: (props: any) => <h1 className="text-3xl font-bold mb-6 text-[var(--foreground)]" {...props} />,
    h2: ({ children, ...props }: any) => {
        const id = typeof children === 'string' ? children.toLowerCase().replace(/\s+/g, '-') : undefined;
        return <h2 id={id} className="text-2xl font-semibold mt-10 mb-4 text-[var(--foreground)] border-b border-[var(--border)] pb-2" {...props}>{children}</h2>;
    },
    h3: ({ children, ...props }: any) => {
        const id = typeof children === 'string' ? children.toLowerCase().replace(/\s+/g, '-') : undefined;
        return <h3 id={id} className="text-xl font-semibold mt-8 mb-3 text-[var(--foreground)]" {...props}>{children}</h3>;
    },
    p: (props: any) => <p className="mb-4 leading-relaxed text-[var(--foreground)]" {...props} />,
    ul: (props: any) => <ul className="list-disc ml-6 mb-4 space-y-2 text-[var(--foreground)]" {...props} />,
    ol: (props: any) => <ol className="list-decimal ml-6 mb-4 space-y-2 text-[var(--foreground)]" {...props} />,
    li: (props: any) => <li className="pl-1" {...props} />,
    strong: (props: any) => <strong className="font-bold text-[var(--foreground)]" {...props} />,
    hr: () => <hr className="my-10 border-[var(--border)]" />,
    blockquote: (props: any) => (
        <blockquote className="border-l-4 border-[var(--accent)] pl-4 italic my-6 text-[var(--foreground-secondary)]" {...props} />
    ),
};
