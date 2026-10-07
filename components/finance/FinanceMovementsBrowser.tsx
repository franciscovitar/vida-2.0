import Link from 'next/link';

import type {
  FinanceMovement,
  FinanceMovementFilters,
  FinanceMovementsModel,
} from '@/lib/finance/movements-core';

import styles from './FinanceMovementsBrowser.module.scss';

interface FinanceMovementsBrowserProps {
  model: FinanceMovementsModel;
  filters: FinanceMovementFilters & { month: string };
  movements: FinanceMovement[];
}

const KIND_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'transfer', label: 'Transferencias' },
] as const;

function formatMinor(value: number, currency: string, signed = false): string {
  const absolute = Math.abs(value) / 100;
  let formatted: string;

  try {
    formatted = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'ARS' ? 0 : 2,
      maximumFractionDigits: currency === 'ARS' ? 0 : 2,
    }).format(absolute);
  } catch {
    formatted = `${currency} ${absolute.toLocaleString('es-AR')}`;
  }

  if (!signed || value === 0) return formatted;
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;

  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function dayKey(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value.slice(0, 10);

  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Argentina/Cordoba',
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : value.slice(0, 10);
}

function dayLabel(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value.slice(0, 10);

  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Cordoba',
  }).format(parsed);
}

function dateTimeLabel(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Cordoba',
  }).format(parsed);
}

function amountTone(movement: FinanceMovement): string {
  if (movement.kind === 'income') return 'income';
  if (movement.kind === 'expense') return 'expense';
  return 'neutral';
}

function movementAmount(movement: FinanceMovement): string {
  if (movement.kind === 'transfer') {
    return formatMinor(movement.amountMinor, movement.currency);
  }
  return formatMinor(movement.signedAmountMinor, movement.currency, true);
}

function queryHref(
  filters: FinanceMovementFilters & { month: string },
  kind: string,
): string {
  const params = new URLSearchParams();
  params.set('month', filters.month);
  if (filters.query) params.set('q', filters.query);
  if (kind !== 'all') params.set('type', kind);
  if (filters.category) params.set('category', filters.category);
  if (filters.source) params.set('source', filters.source);
  return `/finanzas/movimientos?${params.toString()}`;
}

export function FinanceMovementsBrowser({
  model,
  filters,
  movements,
}: FinanceMovementsBrowserProps) {
  const grouped = new Map<string, FinanceMovement[]>();

  for (const movement of movements) {
    const key = dayKey(movement.occurredAt);
    const current = grouped.get(key) ?? [];
    grouped.set(key, [...current, movement]);
  }

  const hasActiveFilters =
    Boolean(filters.query) ||
    (filters.kind ?? 'all') !== 'all' ||
    Boolean(filters.category) ||
    Boolean(filters.source);

  return (
    <section className={styles.browser} aria-labelledby="finance-movements-title">
      <div className={styles.heading}>
        <div>
          <h2 id="finance-movements-title">Movimientos</h2>
          <p>Qué pasó con tu plata, desde la fuente disponible más confiable.</p>
        </div>
        <span>{movements.length} visibles</span>
      </div>

      <form className={styles.filters} method="get">
        <input type="hidden" name="type" value={filters.kind ?? 'all'} />

        <label className={styles.search}>
          <span className={styles['sr-only']}>Buscar movimientos</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.query ?? ''}
            placeholder="Buscar movimientos…"
          />
        </label>

        <div className={styles.chips} aria-label="Filtrar por tipo">
          {KIND_OPTIONS.map((option) => (
            <Link
              aria-current={
                (filters.kind ?? 'all') === option.value ? 'true' : undefined
              }
              href={queryHref(filters, option.value)}
              key={option.value}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <div className={styles.selects}>
          <label>
            <span>Período</span>
            <select name="month" defaultValue={filters.month}>
              {model.months.map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Categoría</span>
            <select name="category" defaultValue={filters.category ?? ''}>
              <option value="">Todas</option>
              {model.categories.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Cuenta / fuente</span>
            <select name="source" defaultValue={filters.source ?? ''}>
              <option value="">Todas</option>
              {model.sources.map((source) => (
                <option key={source.key} value={source.key}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>

          <button type="submit">Aplicar</button>
          {hasActiveFilters ? (
            <Link href="/finanzas/movimientos">Limpiar</Link>
          ) : null}
        </div>
      </form>

      {movements.length === 0 ? (
        <div className={styles.empty}>
          <strong>
            {hasActiveFilters
              ? 'No hay movimientos con estos filtros.'
              : 'Todavía no hay movimientos registrados en este período.'}
          </strong>
          <span>Probá otro período o limpiá los filtros para ampliar la búsqueda.</span>
        </div>
      ) : (
        <div className={styles.groups}>
          {[...grouped.entries()].map(([date, rows]) => (
            <section
              className={styles.group}
              key={date}
              aria-labelledby={`day-${date}`}
            >
              <h3 id={`day-${date}`}>{dayLabel(rows[0].occurredAt)}</h3>

              <div className={styles.list}>
                {rows.map((movement) => (
                  <details className={styles.movement} key={movement.id}>
                    <summary>
                      <div className={styles['movement-main']}>
                        <strong>{movement.description}</strong>
                        <span>
                          {movement.sourceLabel} · {movement.categoryLabel}
                        </span>
                      </div>
                      <strong
                        className={styles.amount}
                        data-tone={amountTone(movement)}
                      >
                        {movementAmount(movement)}
                      </strong>
                    </summary>

                    <div className={styles.detail}>
                      <dl>
                        <div>
                          <dt>Fecha</dt>
                          <dd>{dateTimeLabel(movement.occurredAt)}</dd>
                        </div>
                        <div>
                          <dt>Importe</dt>
                          <dd>{movementAmount(movement)}</dd>
                        </div>
                        <div>
                          <dt>Categoría</dt>
                          <dd>{movement.categoryLabel}</dd>
                        </div>
                        <div>
                          <dt>Cuenta / fuente</dt>
                          <dd>{movement.sourceLabel}</dd>
                        </div>
                        <div>
                          <dt>Estado</dt>
                          <dd>{movement.stateLabel}</dd>
                        </div>
                      </dl>

                      {movement.note && movement.note !== movement.description ? (
                        <p>
                          <strong>Nota:</strong> {movement.note}
                        </p>
                      ) : null}

                      {movement.rawText && movement.rawText !== movement.description ? (
                        <details className={styles.advanced}>
                          <summary>Ver registro original</summary>
                          <p>{movement.rawText}</p>
                        </details>
                      ) : null}

                      <details className={styles.advanced}>
                        <summary>Detalle técnico</summary>
                        <p>
                          Origen:{' '}
                          {movement.origin === 'ledger'
                            ? 'ledger canónico'
                            : 'Finance Logger'}
                          . Rol: {movement.economicRole || 'sin rol explícito'}.
                        </p>
                      </details>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
