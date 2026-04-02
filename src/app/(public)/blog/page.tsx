import type { Metadata } from 'next';
import BlogShell from '@/components/blog/BlogShell';
import BlogIndexClient from '@/components/blog/BlogIndexClient';
import styles from '@/components/blog/blog.module.css';
import { getAllBlogPosts } from '@/lib/blog';
import { getSiteUrl } from '@/lib/siteUrl';

type PageProps = {
  searchParams: Promise<{
    category?: string | string[];
  }>;
};

const title = 'Quran Life Blog | Quran Memorization, Hifdh Strategy, and Product Updates';
const description =
  'Practical articles on Quran memorization, visual mindmaps, spaced repetition, and how to build a stronger hifdh routine with Quran Life.';

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/blog',
  },
  keywords: [
    'Quran blog',
    'hifdh tips',
    'Quran memorization strategies',
    'visual mindmaps Quran',
    'spaced repetition hifdh',
  ],
  openGraph: {
    type: 'website',
    url: '/blog',
    title,
    description,
    siteName: 'Quran Life',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Quran Life blog',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og-image.jpg'],
  },
};

export default async function BlogIndexPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const posts = getAllBlogPosts();
  const categories = Array.from(new Set(posts.flatMap((post) => post.categories)));
  const siteUrl = getSiteUrl();
  const initialSelectedCategories = Array.isArray(resolvedSearchParams.category)
    ? resolvedSearchParams.category
    : resolvedSearchParams.category
      ? [resolvedSearchParams.category]
      : [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Quran Life Blog',
    description,
    url: `${siteUrl}/blog`,
    publisher: {
      '@type': 'Organization',
      name: 'Quran Life',
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
    },
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt ?? post.publishedAt,
      url: `${siteUrl}/blog/${post.slug}`,
      articleSection: post.categories[0],
      author: {
        '@type': 'Organization',
        name: post.author,
      },
    })),
  };

  return (
    <BlogShell activePath="blog">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className={styles.container}>
        <section className={styles.blogHomeLayout}>
          <BlogIndexClient
            posts={posts}
            categories={categories}
            initialSelectedCategories={initialSelectedCategories}
          />
        </section>
      </div>
    </BlogShell>
  );
}
