'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { BlogPostSummary } from '@/lib/blog';
import styles from './blog.module.css';

type BlogIndexClientProps = {
  posts: BlogPostSummary[];
  categories: string[];
  initialSelectedCategories: string[];
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export default function BlogIndexClient({
  posts,
  categories,
  initialSelectedCategories,
}: BlogIndexClientProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialSelectedCategories.filter((value) => categories.includes(value)),
  );

  const filteredPosts = useMemo(() => {
    if (selectedCategories.length === 0) return posts;

    return posts.filter((post) =>
      selectedCategories.every((category) => post.categories.includes(category)),
    );
  }, [posts, selectedCategories]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
  };

  return (
    <>
      <aside className={styles.blogSidebar}>
        <h1 className={styles.sidebarTitle}>Tools & Hifdh</h1>
        <p className={styles.sidebarDescription}>
          Thoughts on memorization, review, and building a steadier Quran routine.
        </p>

        <div className={styles.sidebarBlock}>
          <div className={styles.sidebarLabelRow}>
            <p className={styles.sidebarLabel}>Categories</p>
            {selectedCategories.length > 0 ? (
              <button type="button" className={styles.clearFiltersButton} onClick={clearFilters}>
                Clear
              </button>
            ) : null}
          </div>
          <div className={styles.sidebarTopics}>
            {categories.map((category) => {
              const isActive = selectedCategories.includes(category);

              return (
                <button
                  key={category}
                  type="button"
                  suppressHydrationWarning
                  className={styles.sidebarFilter}
                  data-active={isActive}
                  onClick={() => toggleCategory(category)}
                  aria-pressed={isActive}
                >
                  <span>{category}</span>
                  {isActive ? <X size={14} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <div className={styles.postsGrid}>
        {filteredPosts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className={styles.postCard}>
            <div className={styles.cardBody}>
              <div className={styles.categoryRow}>
                {post.categories.map((category) => (
                  <span key={category} className={styles.category}>
                    {category}
                  </span>
                ))}
              </div>
              <h2 className={styles.postCardTitle}>{post.title}</h2>
              <p className={styles.cardDescription}>{post.excerpt}</p>
              <div className={styles.metaRow}>
                <span className={styles.metaPill}>{formatDate(post.publishedAt)}</span>
                <span className={styles.metaPill}>By {post.author}</span>
              </div>
            </div>
          </Link>
        ))}

        {filteredPosts.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateVisual} aria-hidden="true">
              <span className={styles.emptyStateDot} />
              <span className={styles.emptyStateLine} />
              <span className={styles.emptyStateLineShort} />
            </div>
            <h2 className={styles.emptyStateTitle}>No articles match this combination yet</h2>
            <p className={styles.emptyStateDescription}>
              Try removing one filter, or clear them all to browse every article again.
            </p>
            {selectedCategories.length > 0 ? (
              <div className={styles.emptyStateTags}>
                {selectedCategories.map((category) => (
                  <span key={category} className={styles.emptyStateTag}>
                    {category}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
