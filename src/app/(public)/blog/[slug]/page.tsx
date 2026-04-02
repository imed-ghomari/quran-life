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

function getArticleCta(categories: string[]) {
  if (categories.includes('Product Journey')) {
    return {
      title: 'See what Quran Life is building',
      description: 'Follow the product as it grows into a more complete hifdh system.',
      primaryLabel: 'Start with Quran Life',
    };
  }

  if (categories.includes('Feature Deep Dive') && categories.includes('Philosophy')) {
    return {
      title: 'Try the method inside the app',
      description: 'Use the ideas and the workflow together instead of keeping them separate.',
      primaryLabel: 'Try Quran Life',
    };
  }

  if (categories.includes('Feature Deep Dive')) {
    return {
      title: 'Try this workflow in Quran Life',
      description: 'Use the feature inside a full memorization system, not as an isolated trick.',
      primaryLabel: 'Open Quran Life',
    };
  }

  return {
    title: 'Bring this method into your hifdh',
    description: 'Use visual maps, review timing, and mutashabihat support in one place.',
    primaryLabel: 'Try Quran Life',
  };
}

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
  const postUrl = `${siteUrl}/blog/${post.slug}`;
  const cta = getArticleCta(post.categories);
  const shareLinks = [
    {
      label: 'X',
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(post.title)}`,
    },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(postUrl)}`,
    },
    {
      label: 'Threads',
      href: `https://www.threads.net/intent/post?text=${encodeURIComponent(`${post.title} ${postUrl}`)}`,
    },
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`,
    },
  ];
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

          <div className={styles.articleShareRow}>
            <span className={styles.articleShareLabel}>Share this article</span>
            <div className={styles.articleShareLinks}>
              {shareLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.articleShareLink}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </section>

        <article className={styles.articleBodyWrap}>
          <div className={styles.articleBody}>
            <MDXRemote source={post.content} components={blogMdxComponents} />
          </div>
        </article>

        <section className={styles.articleCtaSection}>
          <div className={styles.ctaPanel}>
            <h2 className={styles.ctaTitle}>{cta.title}</h2>
            <p className={styles.ctaDescription}>{cta.description}</p>
            <div className={styles.ctaActions}>
              <Link href="/auth?plan=monthly" className={styles.siteCta}>
                {cta.primaryLabel}
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
