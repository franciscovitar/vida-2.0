import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';

import { QuickInbox } from '@/components/dashboard/QuickInbox';
import { PageHeader } from '@/components/layout/PageHeader';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Bandeja de entrada' };

export default function BandejaPage() {
  return (
    <div>
      <PageHeader
        title="Bandeja de entrada"
        description="Capturá ideas y pendientes sin fricción. Se enviarán a Notion cuando esté conectado."
        icon={Inbox}
        domain="neutral"
      />
      <div className={styles.wrapper}>
        <QuickInbox />
      </div>
    </div>
  );
}
