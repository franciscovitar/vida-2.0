import { MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';

import { EnglishLearningDashboard } from '@/components/english-learning/EnglishLearningDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadEnglishLearnerProfile } from '@/lib/english-learning/load';

import styles from '../../page.module.scss';

export const metadata: Metadata = { title: 'English Speaking' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function EnglishSpeakingPage() {
  await requireAuthorizedSession();
  const result = await loadEnglishLearnerProfile();

  return (
    <div className={styles.page}>
      <PageHeader
        title="English Speaking"
        description="Tu progreso oral, convertido en evidencia visible sin transformar práctica en una clase."
        icon={MessageCircle}
        domain="learning"
      />
      <EnglishLearningDashboard result={result} />
    </div>
  );
}
