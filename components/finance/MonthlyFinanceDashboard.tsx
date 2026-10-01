import { Pencil, Sparkles, WalletCards } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import type { FinanceMonthlyDashboard } from '@/lib/finance/monthly-dashboard-core';

import styles from './MonthlyFinanceDashboard.module.scss';

interface MonthlyFinanceDashboardProps {
  model: FinanceMonthlyDashboard;
}

function formatMinor(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
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

function snapshotDateLabel(asOf: string): string {
  const parsed = new Date(asOf);
  if (!Number.isFinite(parsed.getTime())) return asOf;
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

function cushionBaseCopy(model: FinanceMonthlyDashboard): string {
  const cushion = model.liquidityCushion;
  if (!cushion) return '';
  const date = snapshotDateLabel(cushion.asOf);
  const base = formatMinor(cushion.baseTotalMinor, model.currency);
  return `Base informada el ${date}: ${base} · se actualiza con los movimientos posteriores`;
}

function paceCopy(model: FinanceMonthlyDashboard): string {
  if (!model.target) return 'Todavía no hay un objetivo de gasto para este mes.';
  if (model.pace === 'over-target') return 'Superaste el objetivo de gasto activo del mes.';
  if (model.pace === 'accelerated') {
    return 'Ojo: venís gastando bastante más rápido de lo que avanzó el mes.';
  }
  if (model.pace === 'watch') return 'Vas un poco por encima del ritmo esperado para este punto.';
  return 'Ritmo tranquilo por ahora.';
}

function paceLabel(model: FinanceMonthlyDashboard): string {
  if (!model.target) return 'Sin objetivo';
  if (model.pace === 'over-target') return 'Objetivo superado';
  if (model.pace === 'accelerated') return 'Ritmo alto';
  if (model.pace === 'watch') return 'Atención';
  return 'En ritmo';
}

export function MonthlyFinanceDashboard({ model }: MonthlyFinanceDashboardProps) {
  const target = model.target;
  const targetUsed = Math.min(1, Math.max(0, model.targetUsedRatio ?? 0));
  const elapsed = Math.min(1, Math.max(0, model.monthElapsedRatio));
  const hasPendingSuggestion =
    target?.suggestionStatus === 'pending' &&
    target.suggestedTargetMinor !== null &&
    target.suggestedTargetMinor !== target.activeTargetMinor;

  return (
    <Card className={styles.dashboard} aria-labelledby="finance-month-now-title">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Este mes</p>
          <h2 id="finance-month-now-title">{monthLabel(model.month)} · tu mes</h2>
          <p>Lo que registrás en Finance Logger aparece acá como tablero visual.</p>
        </div>
        <span className={styles.sync}>Finance Logger · sincronizado</span>
      </div>

      <div className={styles.metrics}>
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
            {formatMinor(model.balanceMinor, model.currency)}
          </strong>
        </div>
        <div>
          <span>Objetivo de gasto</span>
          <strong>
            {target ? formatMinor(target.activeTargetMinor, model.currency) : 'Pendiente'}
          </strong>
          <small>
            <Pencil size={12} aria-hidden="true" />
            editable desde Finance Logger
          </small>
        </div>
      </div>

      {model.liquidityCushion ? (
        <div className={styles.cushion}>
          <div className={styles['cushion-top']}>
            <span className={styles['cushion-icon']} aria-hidden="true">
              <WalletCards size={18} />
            </span>
            <div className={styles['cushion-summary']}>
              <span>Colchón líquido actual</span>
              <strong>{formatMinor(model.liquidityCushion.totalMinor, model.currency)}</strong>
              <small>{cushionBaseCopy(model)}</small>
            </div>
          </div>

          <div className={styles['cushion-sources']}>
            {model.liquidityCushion.sources.map((source) => (
              <div key={source.key} className={styles['cushion-source']}>
                <span>{source.label}</span>
                <strong>{formatMinor(source.amountMinor, model.currency)}</strong>
              </div>
            ))}
          </div>

          <div className={styles['cushion-opening']}>
            <span>Movimientos posteriores a la base</span>
            <strong>{formatMinor(model.liquidityCushion.movementDeltaMinor, model.currency)}</strong>
          </div>
        </div>
      ) : null}

      {target ? (
        <div className={styles.goal}>
          <div className={styles['goal-row']}>
            <div>
              <strong>
                Gastaste {formatMinor(model.expenseMinor, model.currency)} de{' '}
                {formatMinor(target.activeTargetMinor, model.currency)}
              </strong>
              <span>
                {formatPercent(model.targetUsedRatio)} usado ·{' '}
                {model.remainingTargetMinor !== null
                  ? `${formatMinor(model.remainingTargetMinor, model.currency)} dentro del objetivo`
                  : 'sin saldo objetivo'}
              </span>
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
            <span>Marca vertical = avance del mes ({formatPercent(model.monthElapsedRatio)})</span>
          </div>
        </div>
      ) : null}

      <div className={styles.lower}>
        <div className={styles.categories}>
          <div className={styles['section-title']}>
            <strong>En qué se está yendo</strong>
            <span>{model.activeCaptureCount} registros activos</span>
          </div>
          {model.categories.length > 0 ? (
            model.categories.slice(0, 5).map((item) => (
              <div key={item.category} className={styles.category}>
                <div className={styles['category-row']}>
                  <span>{item.category}</span>
                  <strong>{formatMinor(item.amountMinor, model.currency)}</strong>
                </div>
                <div className={styles['category-track']}>
                  <span style={{ width: `${Math.max(4, item.share * 100)}%` }} />
                </div>
              </div>
            ))
          ) : (
            <p className={styles.empty}>Todavía no registraste gastos este mes.</p>
          )}
        </div>

        <div className={styles.intelligence}>
          <div className={styles['section-title']}>
            <strong>Inteligencia del mes</strong>
            <Sparkles size={15} aria-hidden="true" />
          </div>
          {hasPendingSuggestion && target?.suggestedTargetMinor !== null ? (
            <>
              <p>
                ChatGPT sugiere mover el objetivo a{' '}
                <strong>{formatMinor(target.suggestedTargetMinor, model.currency)}</strong>.
              </p>
              <small>{target.suggestionReason || 'Ajuste sugerido por el contexto del mes.'}</small>
              <span className={styles.notice}>
                No se aplica solo: el objetivo actual sigue siendo{' '}
                {formatMinor(target.activeTargetMinor, model.currency)} hasta que lo aceptes.
              </span>
            </>
          ) : (
            <>
              <p>{paceCopy(model)}</p>
              <small>
                Finance Logger puede sugerir subir o bajar el objetivo si cambian materialmente tus
                ingresos reales o el ritmo de gasto.
              </small>
              <span className={styles.notice}>
                Una entrada grande no aumenta el objetivo peso por peso.
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
