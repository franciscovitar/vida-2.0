import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';

import { InboxCapturePanel } from '@/components/actions/InboxCapturePanel';
import { QuickInbox } from '@/components/dashboard/QuickInbox';
import { PageHeader } from '@/components/layout/PageHeader';
import { isWriteActionsEnabled } from '@/lib/actions/config';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Bandeja de entrada' };

export default function BandejaPage() {
  const writesEnabled = isWriteActionsEnabled();

  return (
    <div>
      <PageHeader
        title="Bandeja de entrada"
        description={
          writesEnabled
            ? 'Captura persistente con confirmación explícita.'
            : 'Captura local. Persistencia Notion desactivada (WRITE_ACTIONS_ENABLED).'
        }
        icon={Inbox}
        domain="neutral"
      />
      <div className={styles.wrapper}>
        <InboxCapturePanel writesEnabled={writesEnabled} />
        {!writesEnabled ? <QuickInbox /> : null}
      </div>
    </div>
  );
}
