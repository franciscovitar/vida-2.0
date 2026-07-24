import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { ReviewWorkspace } from '@/components/reviews/ReviewWorkspace';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { listRuntimeProposals } from '@/lib/actions/runtime';
import { requireAuthorizedSession } from '@/lib/auth/dal';

import styles from '../page.module.scss';

export const metadata: Metadata = { title: 'Aprobaciones' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AprobacionesPage() {
  await requireAuthorizedSession();
  const writesEnabled = isWriteActionsEnabled();
  const proposals = writesEnabled ? await listRuntimeProposals() : [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Aprobaciones"
        description="Revisión local de riesgo, reversibilidad y evidencia. No ejecuta acciones."
        icon={ShieldCheck}
        domain="neutral"
      />
      <ReviewWorkspace initialProposals={proposals} />
    </div>
  );
}
