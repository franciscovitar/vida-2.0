import type { FinanceCashFlowMonth } from '@/lib/finance/reporting/cash-flow-core';

import styles from './FinanceCashFlowChart.module.scss';

interface FinanceCashFlowChartProps {
  currency: string;
  monthly: FinanceCashFlowMonth[];
}

function formatMinor(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'ARS' ? 0 : 2,
      maximumFractionDigits: currency === 'ARS' ? 0 : 2,
    }).format(value / 100);
  } catch {
    return `${currency} ${(value / 100).toLocaleString('es-AR')}`;
  }
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat('es-AR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function FinanceCashFlowChart({ currency, monthly }: FinanceCashFlowChartProps) {
  const maximum = Math.max(
    1,
    ...monthly.flatMap((row) => [row.incomeMinor, Math.abs(row.expenseMinor)]),
  );

  return (
    <div className={styles.chart} aria-label={`Cash flow mensual en ${currency}`}>
      <div className={styles.legend} aria-hidden="true">
        <span data-series="income">Ingresos</span>
        <span data-series="expense">Gastos</span>
      </div>

      <div className={styles.rows}>
        {monthly.map((row) => {
          const incomeWidth = Math.max(0, (row.incomeMinor / maximum) * 100);
          const expenseWidth = Math.max(0, (Math.abs(row.expenseMinor) / maximum) * 100);

          return (
            <div className={styles.month} key={row.month}>
              <div className={styles['month-heading']}>
                <strong>{formatMonth(row.month)}</strong>
                <span data-tone={row.netMinor < 0 ? 'negative' : 'positive'}>
                  Neto {formatMinor(row.netMinor, currency)}
                </span>
              </div>

              <div className={styles.series}>
                <span>Ingresos</span>
                <div className={styles.track} aria-hidden="true">
                  <div
                    className={styles.bar}
                    data-series="income"
                    style={{ width: `${incomeWidth}%` }}
                  />
                </div>
                <strong>{formatMinor(row.incomeMinor, currency)}</strong>
              </div>

              <div className={styles.series}>
                <span>Gastos</span>
                <div className={styles.track} aria-hidden="true">
                  <div
                    className={styles.bar}
                    data-series="expense"
                    style={{ width: `${expenseWidth}%` }}
                  />
                </div>
                <strong>{formatMinor(Math.abs(row.expenseMinor), currency)}</strong>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
