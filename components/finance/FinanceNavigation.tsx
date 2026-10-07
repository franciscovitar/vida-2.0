import Link from 'next/link';

import styles from './FinanceNavigation.module.scss';

export type FinanceSection = 'summary' | 'movements' | 'plan' | 'analysis' | 'data';
export type FinanceDataState = 'ready' | 'review' | 'partial' | 'unavailable';

const ITEMS: Array<{ id: FinanceSection; label: string; href: string }> = [
  { id: 'summary', label: 'Resumen', href: '/finanzas' },
  { id: 'movements', label: 'Movimientos', href: '/finanzas/movimientos' },
  { id: 'plan', label: 'Plan', href: '/finanzas/plan' },
  { id: 'analysis', label: 'Análisis', href: '/finanzas/analisis' },
];

const DATA_STATE: Record<FinanceDataState, { symbol: string; label: string }> = {
  ready: { symbol: '✓', label: 'Datos al día' },
  review: { symbol: '!', label: 'Hay datos para revisar' },
  partial: { symbol: '○', label: 'Cobertura parcial' },
  unavailable: { symbol: '×', label: 'Fuente no disponible' },
};

export function FinanceNavigation({
  current,
  dataState,
}: {
  current: FinanceSection;
  dataState?: FinanceDataState;
}) {
  const data = dataState ? DATA_STATE[dataState] : null;

  return (
    <nav className={styles.navigation} aria-label="Secciones de Finanzas">
      <div className={styles.links}>
        {ITEMS.map((item) => (
          <Link
            aria-current={current === item.id ? 'page' : undefined}
            className={styles.link}
            href={item.href}
            key={item.id}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <Link
        aria-current={current === 'data' ? 'page' : undefined}
        className={styles.data}
        data-state={dataState}
        href="/finanzas/datos"
      >
        {data ? <span aria-hidden="true">{data.symbol}</span> : null}
        {data?.label ?? 'Datos y fuentes'}
      </Link>
    </nav>
  );
}
