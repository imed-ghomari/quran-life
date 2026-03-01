import type { Metadata } from 'next';
import HomePageClient from '@/components/LandingPage/HomePageClient';
import { getSiteUrl } from '@/lib/siteUrl';

const title = 'Quran Life | Visual Mindmaps and Spaced Repetition for Quran Hifdh';
const description =
  'Master Quran memorization with visual mindmaps, mutashabihat support, and smart spaced repetition built for serious hifdh students.';

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'Quran memorization app',
    'hifdh app',
    'Quran mindmaps',
    'spaced repetition Quran',
    'mutashabihat',
    'Quran revision',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    title,
    description,
    siteName: 'Quran Life',
    images: [
      {
        url: '/seo-image.png',
        width: 1424,
        height: 752,
        alt: 'Quran Life social preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/seo-image.png'],
  },
};

export default function Home() {
  const siteUrl = getSiteUrl();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Quran Life',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    description,
    url: siteUrl,
    image: `${siteUrl}/seo-image.png`,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: '10',
      highPrice: '96',
      offerCount: 2,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePageClient />
    </>
  );
}
