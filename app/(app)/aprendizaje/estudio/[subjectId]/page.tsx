import { BookOpen, ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/layout/PageHeader';
import { StudySession } from '@/components/study-engine/StudySession';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getUniversityStudyCatalog } from '@/lib/study-engine/catalog-source';
import { getStudySubjectItems } from '@/lib/study-engine/subject-items-source';

import pageStyles from '../../../page.module.scss';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}): Promise<Metadata> {
  const { subjectId } = await params;
  return {
    title: `Estudiar ${subjectId.toUpperCase()}`,
    robots: { index: false, follow: false },
  };
}

export default async function SubjectStudyPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  await requireAuthorizedSession();

  const { subjectId } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(subjectId)) notFound();

  const [catalog, runtime] = await Promise.all([
    getUniversityStudyCatalog(),
    getStudySubjectItems(subjectId),
  ]);

  const subject = catalog.subjects.find((candidate) => candidate.id === subjectId);
  if (!subject) notFound();

  if (runtime.state !== 'ready') {
    return (
      <div className={pageStyles.page}>
        <PageHeader
          title={subject.name}
          description="Sesión Study Engine"
          icon={BookOpen}
          domain="learning"
          action={
            <Button href="/aprendizaje/estudio" variant="ghost" size="sm" iconLeft={ChevronLeft}>
              Materias
            </Button>
          }
        />
        <Card>
          <p>{runtime.notice}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={subject.name}
        description="Preguntas canónicas del Learning OS con evidencia offline-first."
        icon={BookOpen}
        domain="learning"
        action={
          <Button href="/aprendizaje/estudio" variant="ghost" size="sm" iconLeft={ChevronLeft}>
            Materias
          </Button>
        }
      />
      <StudySession items={runtime.items} modeLabel={subject.name} />
    </div>
  );
}
