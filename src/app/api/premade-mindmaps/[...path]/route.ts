import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { notFound, unauthorized } from '@/lib/apiUtils';
import { getServerAccessState } from '@/lib/server/access';

const premadeDir = path.join(process.cwd(), 'private-assets', 'premade-mindmaps');

const ALLOWED_PREMADE_FILE_PATTERNS = [
  /^index\.json$/,
  /^surah-\d+\.tldraw$/,
  /^surah-\d+\.chunks\.txt$/,
  /^part-\d+\.tldraw$/,
];

function buildNoStoreResponse(body: BodyInit, init?: ResponseInit) {
  const response = new NextResponse(body, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

function withNoStoreHeaders(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

function resolveContentType(fileName: string) {
  if (fileName.endsWith('.json') || fileName.endsWith('.tldraw')) {
    return 'application/json; charset=utf-8';
  }

  return 'text/plain; charset=utf-8';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const access = await getServerAccessState();

  if (!access.isAuthenticated) {
    return withNoStoreHeaders(unauthorized());
  }

  const { path: requestedPath } = await params;
  const pathParts = Array.isArray(requestedPath) ? requestedPath : [];
  const fileName = pathParts.join('/');

  if (pathParts.length !== 1 || !ALLOWED_PREMADE_FILE_PATTERNS.some((pattern) => pattern.test(fileName))) {
    return withNoStoreHeaders(notFound());
  }

  const filePath = path.join(premadeDir, fileName);
  const relativePath = path.relative(premadeDir, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return withNoStoreHeaders(notFound());
  }

  try {
    const fileContents = await fs.readFile(filePath, 'utf8');
    return buildNoStoreResponse(fileContents, {
      status: 200,
      headers: {
        'Content-Type': resolveContentType(fileName),
      },
    });
  } catch {
    return withNoStoreHeaders(notFound());
  }
}
