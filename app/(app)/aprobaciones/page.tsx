import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { loadApprovalsBoard } from '@/app/actions/writes';
import { ApprovalsPanel } from '@/components/actions/ApprovalsPanel';
import { CalendarHoldPanel } from '@/components/actions/WritePanels';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReviewWorkspace } from '@/components/reviews/ReviewWorkspace';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { requireAuthorizedSession } from '@/lib/auth/dal';

import styles from '../page.module.scss';

export const metadata: Metadata = { title: 'Aprobaciones' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AprobacionesPage() {
  await requireAuthorizedSession();
  const writesEnabled = isWriteActionsEnabled();
  const board = await loadApprovalsBoard();
  const proposals = board.proposals;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Aprobaciones"
        description={
          writesEnabled
            ? 'Centro de propuestas reversibles y revisión local de borradores.'
            : 'Revisión local de riesgo, reversibilidad y evidencia. No ejecuta acciones.'
        }
        icon={ShieldCheck}
        domain="neutral"
      />
      <ApprovalsPanel writesEnabled={board.writesEnabled} initialProposals={proposals} />
      <CalendarHoldPanel writesEnabled={writesEnabled} />
      <ReviewWorkspace initialProposals={proposals} />
    </div>
  );
}
