import { BookOpen, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';

import { Button } from '@/components/ui/Button';
import { DocumentaryStableKeyPage } from '@/components/web-catalog/DocumentaryStableKeyPage';
import { WEB_CATALOG_FIXED_ROUTES } from '@/lib/web-catalog/section-labels';
import { requireAuthorizedSession } from '@/lib/auth/dal';

export const metadata: Metadata = { title: 'Aprendizaje' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AprendizajePage() {
  await requireAuthorizedSession();

  return (
    <DocumentaryStableKeyPage
      presentation="learning"
      stableKey={WEB_CATALOG_FIXED_ROUTES.aprendizaje.stableKey}
      action={
        <Button href="/aprendizaje/ingles" variant="primary" size="sm" iconLeft={MessageCircle}>
          English Speaking
        </Button>
      }
      placeholder={{
        title: 'Aprendizaje',
        description: 'Cursos, lecturas y conocimiento en progreso.',
        icon: BookOpen,
        domain: 'learning',
        emptyTitle: 'Todavía no hay aprendizaje registrado',
        emptyDescription:
          'Con el Registro Web activo verás acá el documento canónico de aprendizaje.',
        preview: ['En progreso', 'Lecturas pendientes', 'Notas recientes', 'Tiempo dedicado'],
      }}
    />
  );
}
