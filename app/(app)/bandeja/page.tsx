import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';

import { InboxCapturePanel } from '@/components/actions/InboxCapturePanel';
import { InboxPlanningWorkspace } from '@/components/inbox/InboxPlanningWorkspace';
import { PageHeader } from '@/components/layout/PageHeader';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { requireAuthorizedSession } from '@/lib/auth/dal';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Bandeja de entrada' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function BandejaPage() {
  await requireAuthorizedSession();
  const writesEnabled = isWriteActionsEnabled();

  return (
    <div>
      <PageHeader
        title="Bandeja de entrada"
        description="Captura y revisión temporal en el navegador, sin sincronización externa."
        icon={Inbox}
        domain="neutral"
      />
      <div className={styles.wrapper}>
        <InboxCapturePanel writesEnabled={writesEnabled} />
        <InboxPlanningWorkspace />
      </div>
    </div>
  );
}
