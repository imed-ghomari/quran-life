import type { Metadata } from 'next';
import AppTabs from '@/components/AppTabs';
import { getSiteUrl } from '@/lib/siteUrl';

export const metadata: Metadata = {
  title: 'Daily Portion - Quran Life',
  description: 'Complete your Quran portions in manageable daily readings - works offline',
  manifest: '/manifest.json',
};

export default function Page() {
  return <AppTabs />;
}
