import { CircleAlert, Info } from 'lucide-react';

import type { NotionIntegrationStatus } from '@/types/notion';

import styles from '../dashboard/IntegrationNotice.module.scss';

type NoticeTone = 'info' | 'warning';

const TONE: Partial<Record<NotionIntegrationStatus, NoticeTone>> = {
  'not-configured': 'info',
  empty: 'info',
  'auth-error': 'warning',
  'permission-error': 'warning',
  'missing-data-source': 'warning',
  'missing-property': 'warning',
  'rate-limited': 'warning',
  'network-error': 'warning',
  'read-error': 'warning',
};

export function NotionIntegrationNotice({
  status,
  message,
}: {
  status: NotionIntegrationStatus;
  message: string;
}) {
  const tone: NoticeTone = TONE[status] ?? 'info';
  const Icon = tone === 'warning' ? CircleAlert : Info;

  return (
    <div className={styles.notice} data-tone={tone} role="status">
      <Icon size={15} strokeWidth={2} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
