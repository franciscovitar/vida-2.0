import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';

import { InboxPlanningWorkspace } from '@/components/inbox/InboxPlanningWorkspace';
import { PageHeader } from '@/components/layout/PageHeader';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Bandeja de entrada' };

export default function BandejaPage() {
  return (
    <div>
      <PageHeader
        title="Bandeja de entrada"
        description="Captura y revisión temporal en el navegador, sin sincronización externa."
        icon={Inbox}
        domain="neutral"
      />
      <div className={styles.wrapper}>
        <InboxPlanningWorkspace />
      </div>
    </div>
  );
}
