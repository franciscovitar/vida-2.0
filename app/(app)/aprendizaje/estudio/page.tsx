import { Brain, ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { StudySession } from '@/components/study-engine/StudySession';
import { Button } from '@/components/ui/Button';
import { requireAuthorizedSession } from '@/lib/auth/dal';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'Modo estudio' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function StudyEnginePage() {
  await requireAuthorizedSession();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Modo estudio"
        description="Primer flujo real del Study Engine: cinco tipos de práctica conectados a FSRS."
        icon={Brain}
        domain="learning"
        action={
          <Button href="/aprendizaje" variant="ghost" size="sm" iconLeft={ChevronLeft}>
            Aprendizaje
          </Button>
        }
      />
      <StudySession />
    </div>
  );
}
