import type { FinancePlanningSnapshot } from '@/lib/finance/planning-core';

import styles from './PlanningSubtractionTrace.module.scss';

interface PlanningSubtractionTraceProps {
  snapshot: FinancePlanningSnapshot;
}

const BUCKET_LABELS: Record<
  FinancePlanningSnapshot['explanation']['subtractions'][number]['bucket'],
  string
> = {
  reserve: 'Reserva protegida',
  obligation: 'Obligación próxima',
  goal: 'Meta comprometida',
  other: 'Otro compromiso',
};

function formatMinor(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  } catch {
    return `${currency} ${(value / 100).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

export function PlanningSubtractionTrace({ snapshot }: PlanningSubtractionTraceProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.heading}>
        <strong>Cómo se calcula</strong>
        <small>Cada resta queda visible y debe reconciliar exactamente con el resultado.</small>
      </div>

      <div className={styles.rows}>
        <div className={styles.row}>
          <div>
            <strong>Liquidez elegible</strong>
            <small>Base verificada para esta moneda</small>
          </div>
          <span>{formatMinor(snapshot.safeToSpend.eligibleLiquidityMinor, snapshot.currency)}</span>
        </div>

        {snapshot.explanation.subtractions.map((item) => (
          <div key={item.id} className={styles.row}>
            <div>
              <strong>{item.label}</strong>
              <small>{BUCKET_LABELS[item.bucket]}</small>
            </div>
            <span>− {formatMinor(item.amountMinor, snapshot.currency)}</span>
          </div>
        ))}

        <div className={styles.total}>
          <div>
            <strong>Total restado</strong>
            <small>{snapshot.explanation.subtractions.length} línea(s) explicables</small>
          </div>
          <span>
            − {formatMinor(snapshot.explanation.totalSubtractionsMinor, snapshot.currency)}
          </span>
        </div>

        <div className={styles.result}>
          <div>
            <strong>Safe-to-Spend bruto</strong>
            <small>
              {snapshot.safeToSpend.rawSafeToSpendMinor < 0
                ? 'Hay un shortfall que debe resolverse.'
                : 'Capacidad restante antes de una compra simulada.'}
            </small>
          </div>
          <span>{formatMinor(snapshot.safeToSpend.rawSafeToSpendMinor, snapshot.currency)}</span>
        </div>
      </div>
    </div>
  );
}
