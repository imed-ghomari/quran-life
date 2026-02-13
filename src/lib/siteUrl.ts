import 'server-only';

const DEFAULT_SITE_URL = 'http://localhost:3000';

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return DEFAULT_SITE_URL;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function getSiteUrl(): string {
  const candidate =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!candidate) return DEFAULT_SITE_URL;
  return normalizeUrl(candidate);
}
