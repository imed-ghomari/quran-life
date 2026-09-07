import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') || 'philosophy/getting-started';
  const safeSlug = slug.replace(/\.\./g, '').replace(/^\/+/, '');
  const contentDir = path.join(process.cwd(), 'content');
  const filePath = path.join(contentDir, `${safeSlug}.mdx`);
  const altPath = path.join(contentDir, `${safeSlug}/index.mdx`);

  let target = filePath;
  if (!fs.existsSync(target) && fs.existsSync(altPath)) target = altPath;
  if (!fs.existsSync(target)) {
    return NextResponse.json({ error: 'Not found', slug: safeSlug }, { status: 404 });
  }
  const source = fs.readFileSync(target, 'utf8');
  return NextResponse.json({ slug: safeSlug, source });
}
