import { CircleAlert, Info } from 'lucide-react';

import type { TodayStatus } from '@/types';

import styles from './IntegrationNotice.module.scss';

/** Estados que se muestran como aviso (el resto no genera banner). */
type NoticeTone = 'info' | 'warning';

const TONE: Partial<Record<TodayStatus, NoticeTone>> = {
  'not-configured': 'info',
  'no-data': 'info',
  'auth-error': 'warning',
  'permission-error': 'warning',
  'missing-tab': 'warning',
  'missing-header': 'warning',
  'read-error': 'warning',
};

export function IntegrationNotice({ status, message }: { status: TodayStatus; message: string }) {
  const tone: NoticeTone = TONE[status] ?? 'info';
  const Icon = tone === 'warning' ? CircleAlert : Info;

  return (
    <div className={styles.notice} data-tone={tone} role="status">
      <Icon size={15} strokeWidth={2} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
