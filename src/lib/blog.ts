import 'server-only';

import fs from 'fs';
import path from 'path';

export type BlogFrontmatter = {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  isPublished: boolean;
  author: string;
  categories: string[];
  excerpt: string;
  featured: boolean;
};

export type BlogPostSummary = BlogFrontmatter & {
  slug: string;
  readingTimeMinutes: number;
};

export type BlogPost = BlogPostSummary & {
  content: string;
};

const BLOG_CONTENT_DIR = path.join(process.cwd(), 'content', 'blog');
const DEFAULT_AUTHOR = 'Quran Life';
const DEFAULT_CATEGORIES = ['Philosophy'];
const WORDS_PER_MINUTE = 200;

type ParsedFrontmatterValue = string | boolean | string[];
type ParsedFrontmatter = Record<string, ParsedFrontmatterValue>;

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseScalarValue(value: string): ParsedFrontmatterValue {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }

  return stripQuotes(trimmed);
}

function parseFrontmatter(source: string): { data: ParsedFrontmatter; content: string } {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) {
    return { data: {}, content: source };
  }

  const rawFrontmatter = match[1];
  const content = source.slice(match[0].length);
  const data: ParsedFrontmatter = {};
  const lines = rawFrontmatter.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) continue;

    const [, rawKey, rawValue] = keyMatch;
    const key = rawKey.trim();
    const value = rawValue.trim();

    if (!value) {
      const listItems: string[] = [];
      let nextIndex = index + 1;

      while (nextIndex < lines.length) {
        const nextLine = lines[nextIndex];
        const listMatch = nextLine.match(/^\s*-\s*(.+)\s*$/);
        if (!listMatch) break;
        listItems.push(stripQuotes(listMatch[1].trim()));
        nextIndex += 1;
      }

      if (listItems.length > 0) {
        data[key] = listItems;
        index = nextIndex - 1;
      } else {
        data[key] = '';
      }

      continue;
    }

    data[key] = parseScalarValue(value);
  }

  return { data, content };
}

function stripMarkdown(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[>#*_~]/g, ' ')
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getReadingTimeMinutes(content: string): number {
  const wordCount = stripMarkdown(content).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

function getFallbackExcerpt(content: string): string {
  const cleaned = stripMarkdown(content);
  if (cleaned.length <= 180) return cleaned;
  return `${cleaned.slice(0, 177).trimEnd()}...`;
}

function stripLeadingTitleHeading(content: string): string {
  return content.replace(/^#\s+.+?(?:\r?\n){1,2}/, '');
}

function normalizeStringArray(value: ParsedFrontmatterValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeFrontmatter(
  slug: string,
  rawFrontmatter: ParsedFrontmatter,
  content: string,
): BlogFrontmatter {
  const title = typeof rawFrontmatter.title === 'string' ? rawFrontmatter.title.trim() : '';
  const description =
    typeof rawFrontmatter.description === 'string' ? rawFrontmatter.description.trim() : '';
  const publishedAt =
    typeof rawFrontmatter.publishedAt === 'string' ? rawFrontmatter.publishedAt.trim() : '';
  const updatedAt =
    typeof rawFrontmatter.updatedAt === 'string' ? rawFrontmatter.updatedAt.trim() : undefined;
  const isPublished = rawFrontmatter.isPublished === true;
  const author =
    typeof rawFrontmatter.author === 'string' && rawFrontmatter.author.trim()
      ? rawFrontmatter.author.trim()
      : DEFAULT_AUTHOR;
  const categories = normalizeStringArray(rawFrontmatter.categories);
  const legacyCategory =
    typeof rawFrontmatter.category === 'string' && rawFrontmatter.category.trim()
      ? rawFrontmatter.category.trim()
      : '';
  const excerpt =
    typeof rawFrontmatter.excerpt === 'string' && rawFrontmatter.excerpt.trim()
      ? rawFrontmatter.excerpt.trim()
      : getFallbackExcerpt(content);
  const featured = rawFrontmatter.featured === true;
  const normalizedCategories =
    categories.length > 0
      ? categories
      : legacyCategory
        ? [legacyCategory]
        : DEFAULT_CATEGORIES;

  if (!title) {
    throw new Error(`Blog post "${slug}" is missing a title in frontmatter.`);
  }

  if (!description) {
    throw new Error(`Blog post "${slug}" is missing a description in frontmatter.`);
  }

  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
    throw new Error(`Blog post "${slug}" has an invalid publishedAt value.`);
  }

  if (updatedAt && Number.isNaN(Date.parse(updatedAt))) {
    throw new Error(`Blog post "${slug}" has an invalid updatedAt value.`);
  }

  return {
    title,
    description,
    publishedAt,
    updatedAt,
    isPublished,
    author,
    categories: normalizedCategories,
    excerpt,
    featured,
  };
}

function getBlogFilenames(): string[] {
  if (!fs.existsSync(BLOG_CONTENT_DIR)) return [];

  return fs
    .readdirSync(BLOG_CONTENT_DIR)
    .filter((fileName) => fileName.endsWith('.mdx') && !fileName.startsWith('_'));
}

export function getAllBlogPosts(): BlogPostSummary[] {
  return getBlogFilenames()
    .map((fileName) => {
      const slug = fileName.replace(/\.mdx$/, '');
      const filePath = path.join(BLOG_CONTENT_DIR, fileName);
      const source = fs.readFileSync(filePath, 'utf8');
      const { data, content } = parseFrontmatter(source);
      const frontmatter = normalizeFrontmatter(slug, data, content);

      return {
        slug,
        ...frontmatter,
        readingTimeMinutes: getReadingTimeMinutes(content),
      };
    })
    .filter((post) => post.isPublished)
    .sort((first, second) => {
      return Date.parse(second.publishedAt) - Date.parse(first.publishedAt);
    });
}

export function getBlogPostBySlug(slug: string): BlogPost | null {
  const filePath = path.join(BLOG_CONTENT_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const source = fs.readFileSync(filePath, 'utf8');
  const { data, content } = parseFrontmatter(source);
  const frontmatter = normalizeFrontmatter(slug, data, content);

  if (!frontmatter.isPublished) {
    return null;
  }

  return {
    slug,
    ...frontmatter,
    content: stripLeadingTitleHeading(content),
    readingTimeMinutes: getReadingTimeMinutes(content),
  };
}

export function getRelatedBlogPosts(slug: string, limit = 3): BlogPostSummary[] {
  const posts = getAllBlogPosts();
  const currentPost = posts.find((post) => post.slug === slug);
  if (!currentPost) return posts.filter((post) => post.slug !== slug).slice(0, limit);

  return posts
    .filter((post) => post.slug !== slug)
    .sort((first, second) => {
      const firstSharedCategories = first.categories.filter((category) =>
        currentPost.categories.includes(category),
      ).length;
      const secondSharedCategories = second.categories.filter((category) =>
        currentPost.categories.includes(category),
      ).length;

      if (firstSharedCategories !== secondSharedCategories) {
        return secondSharedCategories - firstSharedCategories;
      }

      return Date.parse(second.publishedAt) - Date.parse(first.publishedAt);
    })
    .slice(0, limit);
}
