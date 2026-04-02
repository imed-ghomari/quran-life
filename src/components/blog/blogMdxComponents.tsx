import Link from 'next/link';
import type { MDXComponents } from 'mdx/types';

export const blogMdxComponents: MDXComponents = {
  a: ({ href, children, ...props }: any) => {
    if (href?.startsWith('/') || href?.startsWith('./') || href?.startsWith('../')) {
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      );
    }

    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
};
