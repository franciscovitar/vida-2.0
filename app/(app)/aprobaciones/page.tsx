import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { ApprovalsPanel } from '@/components/actions/ApprovalsPanel';
import { PageHeader } from '@/components/layout/PageHeader';
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
        description="Propuestas y decisiones. Calendar solo como propuesta, sin eventos reales."
        icon={ShieldCheck}
        domain="neutral"
      />
      <ApprovalsPanel writesEnabled={writesEnabled} initialProposals={proposals} />
    </div>
  );
}
