import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/siteUrl';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/terms'],
        disallow: ['/api/', '/dashboard', '/todo', '/statistics', '/settings', '/docs', '/checkout'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
