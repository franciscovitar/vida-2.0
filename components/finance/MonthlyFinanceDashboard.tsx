import { Sparkles, WalletCards } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import type {
  FinanceMonthlyDashboard,
  FinanceMonthlyMovement,
} from '@/lib/finance/monthly-dashboard-core';

import styles from './MonthlyFinanceDashboard.module.scss';

interface MonthlyFinanceDashboardProps {
  model: FinanceMonthlyDashboard;
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
    return `${currency} ${Math.round(value / 100).toLocaleString('es-AR')}`;
  }
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';

  return new Intl.NumberFormat('es-AR', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
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

function movementDateLabel(occurredAt: string): string {
  const parsed = new Date(occurredAt);
  if (!Number.isFinite(parsed.getTime())) return occurredAt.slice(0, 10);

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Argentina/Cordoba',
  }).format(parsed);
}

function snapshotDateLabel(asOf: string): string {
  const parsed = new Date(asOf);
  if (!Number.isFinite(parsed.getTime())) return asOf;

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

function categoryLabel(category: string): string {
  const normalized = category.replaceAll('_', ' ').replaceAll('/', ' / ').trim();
  if (!normalized) return 'Movimiento';

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function paceCopy(model: FinanceMonthlyDashboard): string {
  if (!model.target) return 'Todavía no hay un objetivo de gasto para este mes.';
  if (model.pace === 'over-target') return 'Superaste el objetivo de gasto activo del mes.';

  if (model.pace === 'accelerated') {
    return 'Venís gastando bastante más rápido de lo que avanzó el mes.';
  }

  if (model.pace === 'watch') {
    return 'Vas un poco por encima del ritmo esperado para este punto.';
  }

  return 'El ritmo de gasto está alineado con este punto del mes.';
}

function paceLabel(model: FinanceMonthlyDashboard): string {
  if (!model.target) return 'Sin objetivo';
  if (model.pace === 'over-target') return 'Objetivo superado';
  if (model.pace === 'accelerated') return 'Ritmo alto';
  if (model.pace === 'watch') return 'Atención';

  return 'En ritmo';
}

function movementAmount(movement: FinanceMonthlyMovement): string {
  const amount = formatMinor(movement.amountMinor, movement.currency);
  return movement.direction === 'income' ? `+${amount}` : `-${amount}`;
}

export function MonthlyFinanceDashboard({ model }: MonthlyFinanceDashboardProps) {
  const target = model.target;
  const targetUsed = Math.min(1, Math.max(0, model.targetUsedRatio ?? 0));
  const elapsed = Math.min(1, Math.max(0, model.monthElapsedRatio));
  const hasPendingSuggestion =
    target?.suggestionStatus === 'pending' &&
    target.suggestedTargetMinor !== null &&
    target.suggestedTargetMinor !== target.activeTargetMinor;

  const targetValue =
    model.remainingTargetMinor === null
      ? 'Sin dato'
      : `${formatMinor(model.remainingTargetMinor, model.currency)} restantes`;

  const targetSummary = target
    ? `Gastaste ${formatMinor(model.expenseMinor, model.currency)} de ${formatMinor(
        target.activeTargetMinor,
        model.currency,
      )} · ${formatPercent(model.targetUsedRatio)} usado`
    : '';

  const liquidityDetail = model.liquidityCushion
    ? `Base informada el ${snapshotDateLabel(model.liquidityCushion.asOf)}: ${formatMinor(
        model.liquidityCushion.baseTotalMinor,
        model.currency,
      )}. Movimientos posteriores: ${formatMinor(
        model.liquidityCushion.movementDeltaMinor,
        model.currency,
      )}.`
    : '';

  return (
    <section className={styles.dashboard} aria-labelledby="finance-month-now-title">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Este mes</p>
          <h2 id="finance-month-now-title">{monthLabel(model.month)}</h2>
          <p>Tu situación actual, con lo que registraste hasta hoy.</p>
        </div>
        <span className={styles.capture}>
          {model.activeCaptureCount}{' '}
          {model.activeCaptureCount === 1 ? 'registro activo' : 'registros activos'}
        </span>
      </div>

      {target ? (
        <Card className={styles.target}>
          <div className={styles['target-top']}>
            <div>
              <span className={styles['target-label']}>Margen del objetivo</span>
              <strong className={styles['target-value']}>{targetValue}</strong>
              <span className={styles['target-copy']}>{targetSummary}</span>
            </div>
            <span className={styles.pace} data-pace={model.pace}>
              {paceLabel(model)}
            </span>
          </div>

          <div
            className={styles.track}
            role="progressbar"
            aria-label="Avance del gasto mensual"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(targetUsed * 100)}
            aria-valuetext={`${Math.round(targetUsed * 100)}% del objetivo usado; ${Math.round(
              elapsed * 100,
            )}% del mes transcurrido`}
          >
            <span className={styles.fill} style={{ width: `${targetUsed * 100}%` }} />
            <span
              className={styles.marker}
              style={{ left: `${elapsed * 100}%` }}
              aria-hidden="true"
            />
          </div>

          <div className={styles['track-caption']}>
            <span>{paceCopy(model)}</span>
            <span>Marca vertical: avance del mes ({formatPercent(model.monthElapsedRatio)})</span>
          </div>
        </Card>
      ) : (
        <Card className={styles.target}>
          <span className={styles['target-label']}>Objetivo mensual</span>
          <strong className={styles['target-value']}>Todavía no está definido</strong>
          <span className={styles['target-copy']}>
            Finance Logger puede registrar un objetivo cuando quieras usar ritmo mensual.
          </span>
        </Card>
      )}

      <div className={styles.metrics} aria-label="Resumen del mes">
        <div>
          <span>Ingresos</span>
          <strong data-tone="positive">{formatMinor(model.incomeMinor, model.currency)}</strong>
        </div>
        <div>
          <span>Gastos</span>
          <strong data-tone="negative">{formatMinor(model.expenseMinor, model.currency)}</strong>
        </div>
        <div>
          <span>Balance</span>
          <strong data-tone={model.balanceMinor >= 0 ? 'positive' : 'negative'}>
            {model.balanceMinor >= 0 ? '+' : ''}
            {formatMinor(model.balanceMinor, model.currency)}
          </strong>
        </div>
      </div>

      <div className={styles.supporting}>
        {model.liquidityCushion ? (
          <Card className={styles.liquidity} aria-labelledby="finance-liquidity-title">
            <div className={styles['section-heading']}>
              <span className={styles.icon} aria-hidden="true">
                <WalletCards size={17} />
              </span>
              <div>
                <span>Liquidez actual</span>
                <strong id="finance-liquidity-title">
                  {formatMinor(model.liquidityCushion.totalMinor, model.currency)}
                </strong>
              </div>
            </div>

            <div className={styles['liquidity-sources']}>
              {model.liquidityCushion.sources.map((source) => (
                <div key={source.key}>
                  <span>{source.label}</span>
                  <strong>{formatMinor(source.amountMinor, model.currency)}</strong>
                </div>
              ))}
            </div>

            <details className={styles.explain}>
              <summary>Cómo se calcula</summary>
              <p>{liquidityDetail}</p>
            </details>
          </Card>
        ) : null}

        <Card className={styles.insight} aria-labelledby="finance-look-title">
          <div className={styles['section-heading']}>
            <span className={styles.icon} aria-hidden="true">
              <Sparkles size={17} />
            </span>
            <div>
              <span>Para mirar</span>
              <strong id="finance-look-title">{paceLabel(model)}</strong>
            </div>
          </div>

          {hasPendingSuggestion && target?.suggestedTargetMinor !== null ? (
            <>
              <p>
                Finance Logger sugiere revisar el objetivo a{' '}
                <strong>{formatMinor(target.suggestedTargetMinor, model.currency)}</strong>.
              </p>
              <small>
                {target.suggestionReason || 'El contexto del mes cambió materialmente.'}
              </small>
              <span className={styles.notice}>
                No se aplica solo: el objetivo actual sigue siendo{' '}
                {formatMinor(target.activeTargetMinor, model.currency)}.
              </span>
            </>
          ) : (
            <>
              <p>{paceCopy(model)}</p>
              <small>
                El objetivo puede revisarse si cambian de forma material tus ingresos reales o el
                ritmo de gasto.
              </small>
            </>
          )}
        </Card>
      </div>

      <div className={styles.lower}>
        <Card className={styles.categories} aria-labelledby="finance-categories-title">
          <div className={styles['list-heading']}>
            <strong id="finance-categories-title">En qué se está yendo</strong>
            <Link href="/finanzas/analisis">Ver análisis →</Link>
          </div>

          {model.categories.length > 0 ? (
            model.categories.slice(0, 5).map((item) => (
              <div key={item.category} className={styles.category}>
                <div className={styles['category-row']}>
                  <span>{categoryLabel(item.category)}</span>
                  <strong>{formatMinor(item.amountMinor, model.currency)}</strong>
                </div>
                <div className={styles['category-track']} aria-hidden="true">
                  <span style={{ width: `${Math.max(4, item.share * 100)}%` }} />
                </div>
              </div>
            ))
          ) : (
            <p className={styles.empty}>Todavía no registraste gastos este mes.</p>
          )}
        </Card>

        <Card className={styles.movements} aria-labelledby="finance-recent-title">
          <div className={styles['list-heading']}>
            <strong id="finance-recent-title">Últimos registros</strong>
            <Link href="/finanzas/movimientos">Ver todos →</Link>
          </div>

          {model.recentMovements.length > 0 ? (
            <div className={styles['movement-list']}>
              {model.recentMovements.map((movement) => (
                <div className={styles.movement} key={movement.id}>
                  <time dateTime={movement.occurredAt}>
                    {movementDateLabel(movement.occurredAt)}
                  </time>
                  <div>
                    <strong>{categoryLabel(movement.category)}</strong>
                    <span>{movement.liquiditySourceLabel}</span>
                  </div>
                  <strong data-tone={movement.direction}>{movementAmount(movement)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Todavía no hay registros activos este mes.</p>
          )}
        </Card>
      </div>
    </section>
  );
}
