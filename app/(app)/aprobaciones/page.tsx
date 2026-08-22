import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { loadApprovalsBoard, loadWriteOperabilityMatrix } from '@/app/actions/writes';
import { ApprovalsPanel } from '@/components/actions/ApprovalsPanel';
import { OperabilityPanel } from '@/components/actions/OperabilityPanel';
import { CalendarHoldPanel } from '@/components/actions/WritePanels';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReviewWorkspace } from '@/components/reviews/ReviewWorkspace';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { isActionOperable } from '@/lib/actions/operability';
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
  const operability = await loadWriteOperabilityMatrix();
  const calendarReady =
    !operability ||
    (operability.global !== 'disabled' && isActionOperable(operability, 'calendar.hold.create'));

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
      {operability ? <OperabilityPanel matrix={operability} /> : null}
      <ApprovalsPanel writesEnabled={board.writesEnabled} initialProposals={proposals} />
      <CalendarHoldPanel writesEnabled={writesEnabled} actionReady={calendarReady} />
      <ReviewWorkspace initialProposals={proposals} />
    </div>
  );
}
