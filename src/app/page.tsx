import type { Metadata } from 'next';
import AppTabs from '@/components/AppTabs';
import { getSiteUrl } from '@/lib/siteUrl';

export const metadata: Metadata = {
  title: 'Quran Anki Companion',
  description: 'Daily portion and Anki companion for Quran memorization — works offline',
  manifest: '/manifest.json',
};

export default function Page() {
  return <AppTabs />;
}
