import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const contentDir = path.join(process.cwd(), 'content');
  const philDir = path.join(contentDir, 'philosophy');
  const metaPath = path.join(philDir, '_meta.json');
  let meta: Record<string, string> = {};
  if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const items = Object.entries(meta).map(([key, title]) => ({
    slug: `philosophy/${key}`,
    title: typeof title === 'string' ? title : (title as any).title,
    href: `/docs/${key}`,
  }));
  // also include index
  items.unshift({ slug: 'index', title: 'Introduction', href: '/docs' });
  return NextResponse.json({ items });
}
