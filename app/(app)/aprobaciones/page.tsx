import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { loadApprovalsBoard, loadWriteOperabilityMatrix } from '@/app/actions/writes';
import { ApprovalsPanel } from '@/components/actions/ApprovalsPanel';
import { OperabilityPanel } from '@/components/actions/OperabilityPanel';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReviewWorkspace } from '@/components/reviews/ReviewWorkspace';
import { requireAuthorizedSession } from '@/lib/auth/dal';

import styles from '../page.module.scss';

export const metadata: Metadata = { title: 'Aprobaciones' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AprobacionesPage() {
  await requireAuthorizedSession();
  const board = await loadApprovalsBoard();
  const proposals = board.proposals;
  const operability = await loadWriteOperabilityMatrix();

  return (
    <div className={styles.page}>
      <PageHeader
        title="Aprobaciones"
        description="Consola excepcional para revisar riesgo, reversibilidad y propuestas originadas fuera de la web."
        icon={ShieldCheck}
        domain="neutral"
      />
      {operability ? <OperabilityPanel matrix={operability} /> : null}
      <ApprovalsPanel writesEnabled={board.writesEnabled} initialProposals={proposals} />
      <ReviewWorkspace initialProposals={proposals} />
    </div>
  );
}
