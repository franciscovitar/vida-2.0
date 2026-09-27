import { Brain, ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { StudySession } from '@/components/study-engine/StudySession';
import { Button } from '@/components/ui/Button';
import { requireAuthorizedSession } from '@/lib/auth/dal';

import pageStyles from '../../../page.module.scss';

export const metadata: Metadata = { title: 'Demo Study Engine' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function StudyEngineDemoPage() {
  await requireAuthorizedSession();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Demo Study Engine"
        description="Flujo técnico de práctica conectado a FSRS, persistencia local y sync remoto."
        icon={Brain}
        domain="learning"
        action={
          <Button href="/aprendizaje/estudio" variant="ghost" size="sm" iconLeft={ChevronLeft}>
            Materias
          </Button>
        }
      />
      <StudySession />
    </div>
  );
}
