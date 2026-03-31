import type { Metadata } from 'next';
import Link from 'next/link';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import BlogShell from '@/components/blog/BlogShell';
import styles from '@/components/blog/blog.module.css';
import { blogMdxComponents } from '@/components/blog/blogMdxComponents';
import { getAllBlogPosts, getBlogPostBySlug, getRelatedBlogPosts } from '@/lib/blog';
import { getSiteUrl } from '@/lib/siteUrl';

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) {
    return {};
  }

  const title = `${post.title} | Quran Life Blog`;

  return {
    title,
    description: post.description,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    keywords: post.categories,
    openGraph: {
      type: 'article',
      url: `/blog/${post.slug}`,
      title,
      description: post.description,
      siteName: 'Quran Life',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      authors: [post.author],
      tags: post.categories,
      images: [
        {
          url: '/og-image.jpg',
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: post.description,
      images: ['/og-image.jpg'],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedBlogPosts(slug);
  const siteUrl = getSiteUrl();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: {
      '@type': 'Organization',
      name: post.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Quran Life',
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/logo.png`,
      },
    },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
    url: `${siteUrl}/blog/${post.slug}`,
    keywords: post.categories.join(', '),
    articleSection: post.categories[0],
    image: `${siteUrl}/og-image.jpg`,
  };

  return (
    <BlogShell activePath="blog">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className={styles.container}>
        <section className={styles.articleIntro}>
          <Link href="/blog" className={styles.backLink}>
            ← All posts
          </Link>
          <div className={styles.articleCategoryLinks}>
            {post.categories.map((category) => (
              <Link
                key={category}
                href={`/blog?category=${encodeURIComponent(category)}`}
                className={styles.category}
              >
                {category}
              </Link>
            ))}
          </div>
          <h1 className={styles.articleTitle}>{post.title}</h1>

          <div className={styles.articleMetaBar}>
            <p className={styles.authorName}>By {post.author}</p>
            <p className={styles.articleDate}>{formatDate(post.publishedAt)}</p>
          </div>
        </section>

        <article className={styles.articleBodyWrap}>
          <div className={styles.articleBody}>
            <MDXRemote source={post.content} components={blogMdxComponents} />
          </div>
        </article>

        <section className={styles.articleCtaSection}>
          <div className={styles.ctaPanel}>
            <h2 className={styles.ctaTitle}>Want a calmer hifdh workflow?</h2>
            <p className={styles.ctaDescription}>
              Visual maps, smarter review timing, and clearer mutashabihat support in one place.
            </p>
            <div className={styles.ctaActions}>
              <Link href="/auth?plan=monthly" className={styles.siteCta}>
                Try Quran Life
              </Link>
              <Link href="/blog" className={styles.ctaButtonSecondary}>
                Back to the blog
              </Link>
            </div>
          </div>
        </section>

        {relatedPosts.length > 0 ? (
          <section className={styles.articleRelatedSection}>
            <div className={styles.sectionTitleRow}>
              <div>
                <h2 className={styles.sectionTitle}>Related articles</h2>
                <p className={styles.sectionDescription}>
                  Keep reading from the same topic area if you want to strengthen the same part of
                  your memorization workflow.
                </p>
              </div>
            </div>

            <div className={styles.postsGrid}>
              {relatedPosts.map((relatedPost) => (
                <Link
                  key={relatedPost.slug}
                  href={`/blog/${relatedPost.slug}`}
                  className={styles.postCard}
                >
                  <div className={styles.cardBody}>
                    <div className={styles.categoryRow}>
                      {relatedPost.categories.map((category) => (
                        <span key={category} className={styles.category}>
                          {category}
                        </span>
                      ))}
                    </div>
                    <h3 className={styles.postCardTitle}>{relatedPost.title}</h3>
                    <p className={styles.cardDescription}>{relatedPost.excerpt}</p>
                    <div className={styles.metaRow}>
                      <span className={styles.metaPill}>Published {formatDate(relatedPost.publishedAt)}</span>
                      <span className={styles.metaPill}>
                        {relatedPost.readingTimeMinutes} min read
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </BlogShell>
  );
}
