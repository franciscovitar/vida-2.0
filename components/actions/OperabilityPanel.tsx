import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { WriteOperabilityMatrix } from '@/lib/actions/operability';

import styles from './WritePanels.module.scss';

const STATE_LABEL: Record<WriteOperabilityMatrix['global'], string> = {
  ready: 'Lista',
  blocked: 'Bloqueada',
  misconfigured: 'Mal configurada',
  disabled: 'Desactivada',
};

export function OperabilityPanel({ matrix }: { matrix: WriteOperabilityMatrix }) {
  return (
    <Card>
      <SectionHeader
        title="Operabilidad de escrituras"
        description="Lectura sanitizada de prerrequisitos por acción. Sin secretos ni IDs."
        domain="neutral"
      />
      <p className={styles.message}>
        Global: <strong>{STATE_LABEL[matrix.global]}</strong>
      </p>
      <ul className={styles.diff}>
        {matrix.actions.map((row) => (
          <li key={row.actionType}>
            <code>{row.actionType}</code> — {row.state}
            {row.issues.length > 0 ? ` (${row.issues.join(', ')})` : ''}
          </li>
        ))}
      </ul>
    </Card>
  );
}
