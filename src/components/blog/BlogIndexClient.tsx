'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { BlogPostSummary } from '@/lib/blog';
import styles from './blog.module.css';

type BlogIndexClientProps = {
  posts: BlogPostSummary[];
  categories: string[];
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export default function BlogIndexClient({ posts, categories }: BlogIndexClientProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const filteredPosts = useMemo(() => {
    if (selectedCategories.length === 0) return posts;

    return posts.filter((post) => selectedCategories.includes(post.category));
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
              <span className={styles.category}>{post.category}</span>
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
            <h2 className={styles.emptyStateTitle}>No posts in this filter yet</h2>
            <p className={styles.emptyStateDescription}>
              Try another category or clear the current filter to see all articles.
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
