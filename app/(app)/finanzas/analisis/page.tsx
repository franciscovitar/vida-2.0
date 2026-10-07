import Link from 'next/link';
import { CircleGauge, Landmark, ShieldCheck, WalletCards } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { FinanceCashFlowChart } from '@/components/finance/FinanceCashFlowChart';
import { FinanceNavigation } from '@/components/finance/FinanceNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  buildFinanceAnalysisView,
  FINANCE_ANALYSIS_RANGES,
  normalizeFinanceAnalysisRange,
  type FinanceAnalysisRange,
} from '@/lib/finance/analysis-core';
import { resolveFinanceDataState } from '@/lib/finance/data-state';
import { getFinancePlanningStoreSnapshot } from '@/lib/finance/planning-store';
import { buildFinanceResilienceIndicators } from '@/lib/finance/resilience-core';
import { getFinanceCashFlowSnapshot } from '@/lib/finance/reporting/cash-flow';
import { getFinanceStoreReadinessSnapshot } from '@/lib/finance/store/readiness';
import type { FinanceEconomicRole } from '@/types/finance';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Análisis · Finanzas' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RANGE_LABELS: Record<FinanceAnalysisRange, string> = {
  '3m': '3M',
  '6m': '6M',
  ytd: 'YTD',
  '12m': '12M',
};

const ROLE_LABELS: Partial<Record<FinanceEconomicRole, string>> = {
  income_work: 'Ingresos de trabajo',
  income_family_support: 'Ayuda familiar',
  income_financial: 'Rendimientos',
  expense_personal: 'Gastos personales',
  expense_professional: 'Gastos profesionales',
  refund_adjustment: 'Devoluciones y ajustes',
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatMinor(value: number, currency: string, exact = false): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: exact ? 2 : currency === 'ARS' ? 0 : 2,
      maximumFractionDigits: exact ? 2 : currency === 'ARS' ? 0 : 2,
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
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatRatio(value: number | null): string {
  if (value === null) return 'Pendiente';
  return new Intl.NumberFormat('es-AR', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatMonths(value: number | null): string {
  if (value === null) return 'Pendiente';
  return `${value.toLocaleString('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} meses`;
}

function tone(value: number): 'positive' | 'negative' | 'neutral' {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function analysisHref(range: FinanceAnalysisRange, currency: string): string {
  const params = new URLSearchParams({ range, currency });
  return `/finanzas/analisis?${params.toString()}`;
}

export default async function FinanceAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string | string[];
    currency?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const range = normalizeFinanceAnalysisRange(params.range);
  const store = await getFinanceStoreReadinessSnapshot();
  const connected = store.status === 'connected';
  const reads = connected
    ? await Promise.all([getFinanceCashFlowSnapshot(), getFinancePlanningStoreSnapshot()])
    : null;
  const cashFlow = reads?.[0] ?? null;
  const planning = reads?.[1] ?? null;
  const report = cashFlow?.ok ? cashFlow.report : null;
  const planningModel = planning?.ok ? planning.model : null;
  const dataState = resolveFinanceDataState({ connected, report });
  const currencies = report
    ? [...new Set(report.monthly.map((row) => row.currency))].sort((left, right) => {
        if (left === right) return 0;
        if (left === 'ARS') return -1;
        if (right === 'ARS') return 1;
        return left.localeCompare(right);
      })
    : [];
  const requestedCurrency = firstParam(params.currency)?.trim().toUpperCase();
  const currency =
    requestedCurrency && currencies.includes(requestedCurrency)
      ? requestedCurrency
      : currencies.includes('ARS')
        ? 'ARS'
        : (currencies[0] ?? 'ARS');
  const analysis = report ? buildFinanceAnalysisView(report, currency, range) : null;
  const planningSnapshot =
    planningModel?.currencies.find((item) => item.currency === currency)?.snapshot ?? null;
  const scopedReport =
    report && analysis
      ? {
          ...report,
          monthly: analysis.monthly,
          monthlyRoleTotals: analysis.monthlyRoleTotals,
          roleTotals: analysis.roleTotals,
        }
      : null;
  const resilience = scopedReport
    ? buildFinanceResilienceIndicators(scopedReport, currency, planningSnapshot)
    : null;
  const compositionMax = analysis
    ? Math.max(1, ...analysis.roleTotals.map((row) => Math.abs(row.totalMinor)))
    : 1;

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Entendé tu mes, tus movimientos y tus decisiones."
        icon={WalletCards}
        domain="finance"
      />

      <FinanceNavigation current="analysis" dataState={dataState} />

      {analysis ? (
        <>
          <Card aria-labelledby="finance-analysis-title">
            <SectionHeader
              id="finance-analysis-title"
              title="Análisis"
              description="Leé el histórico por período y moneda sin mezclar coberturas ni tipos de cambio."
              icon={CircleGauge}
              domain="finance"
            />

            <div className={styles.controls}>
              <div className={styles['control-group']} aria-label="Período de análisis">
                <span>Período</span>
                <div>
                  {FINANCE_ANALYSIS_RANGES.map((item) => (
                    <Link
                      aria-current={range === item ? 'page' : undefined}
                      href={analysisHref(item, currency)}
                      key={item}
                      scroll={false}
                    >
                      {RANGE_LABELS[item]}
                    </Link>
                  ))}
                </div>
              </div>

              {currencies.length > 1 ? (
                <div className={styles['control-group']} aria-label="Moneda del análisis">
                  <span>Moneda</span>
                  <div>
                    {currencies.map((item) => (
                      <Link
                        aria-current={currency === item ? 'page' : undefined}
                        href={analysisHref(range, item)}
                        key={item}
                        scroll={false}
                      >
                        {item}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <p className={styles.scope} data-state={analysis.hasMonthGaps ? 'partial' : 'ready'}>
              Ventana {formatMonth(analysis.windowStartMonth)} →{' '}
              {formatMonth(analysis.windowEndMonth)} · {analysis.observedMonthCount}/
              {analysis.expectedMonthCount} meses con cash flow registrado. La cobertura exacta de
              cada fuente se mantiene visible en “Datos y fuentes”; un mes puede ser parcial aunque
              aparezca en este análisis.
            </p>
          </Card>

          <div className={styles['metric-grid']} aria-label="Totales del período">
            <Card compact>
              <span>Ingresos · {currency}</span>
              <strong data-tone="positive">
                {formatMinor(analysis.totals.incomeMinor, currency)}
              </strong>
            </Card>
            <Card compact>
              <span>Gastos · {currency}</span>
              <strong data-tone="negative">
                {formatMinor(Math.abs(analysis.totals.expenseMinor), currency)}
              </strong>
            </Card>
            <Card compact>
              <span>Resultado neto · {currency}</span>
              <strong data-tone={tone(analysis.totals.netMinor)}>
                {formatMinor(analysis.totals.netMinor, currency)}
              </strong>
            </Card>
            <Card compact>
              <span>Ajustes · {currency}</span>
              <strong data-tone={tone(analysis.totals.adjustmentMinor)}>
                {formatMinor(analysis.totals.adjustmentMinor, currency)}
              </strong>
            </Card>
          </div>

          <Card aria-labelledby="finance-cash-flow-chart-title">
            <SectionHeader
              id="finance-cash-flow-chart-title"
              title="Cash flow mensual"
              description="Ingresos y gastos del período seleccionado, con el neto visible mes a mes."
              icon={CircleGauge}
              domain="finance"
            />
            <FinanceCashFlowChart currency={currency} monthly={analysis.monthly} />

            <details className={styles.disclosure}>
              <summary>Ver tabla exacta</summary>
              <div
                className={styles['table-wrap']}
                tabIndex={0}
                aria-label={`Tabla exacta de cash flow en ${currency}; desplazable horizontalmente si hace falta`}
              >
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th>Ingresos</th>
                      <th>Gastos</th>
                      <th>Ajustes</th>
                      <th>Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.monthly.map((row) => (
                      <tr key={row.month}>
                        <th scope="row">{formatMonth(row.month)}</th>
                        <td>{formatMinor(row.incomeMinor, currency, true)}</td>
                        <td>{formatMinor(Math.abs(row.expenseMinor), currency, true)}</td>
                        <td>{formatMinor(row.adjustmentMinor, currency, true)}</td>
                        <td>
                          <strong data-tone={tone(row.netMinor)}>
                            {formatMinor(row.netMinor, currency, true)}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>

          <Card aria-labelledby="finance-composition-title">
            <SectionHeader
              id="finance-composition-title"
              title="Composición"
              description="Qué tipos de ingresos, gastos y ajustes explican el período seleccionado."
              icon={Landmark}
              domain="finance"
            />

            {analysis.roleTotals.length > 0 ? (
              <div className={styles.composition}>
                {analysis.roleTotals.map((row) => {
                  const width = (Math.abs(row.totalMinor) / compositionMax) * 100;
                  return (
                    <div className={styles['composition-row']} key={row.role}>
                      <div className={styles['composition-heading']}>
                        <div>
                          <strong>{ROLE_LABELS[row.role] ?? row.role}</strong>
                          <span>{row.count} movimientos económicos</span>
                        </div>
                        <strong data-tone={tone(row.totalMinor)}>
                          {formatMinor(row.totalMinor, row.currency)}
                        </strong>
                      </div>
                      <div className={styles['composition-track']} aria-hidden="true">
                        <div data-tone={tone(row.totalMinor)} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.empty}>No hay composición económica para este período.</p>
            )}
          </Card>

          {resilience ? (
            <Card aria-labelledby="finance-health-title">
              <SectionHeader
                id="finance-health-title"
                title="Salud financiera"
                description="Indicadores separados y explicables; no se combinan en un score."
                icon={ShieldCheck}
                domain="finance"
              />

              <div className={styles['health-grid']}>
                <div>
                  <span>Trabajo / ingresos</span>
                  <strong>{formatRatio(resilience.earnedIncomeShare)}</strong>
                </div>
                <div>
                  <span>Variación mensual de ingresos</span>
                  <strong>{formatRatio(resilience.monthlyIncomeVolatility)}</strong>
                </div>
                <div>
                  <span>Cobertura de reserva</span>
                  <strong>{formatMonths(resilience.reserveCoverageMonths)}</strong>
                </div>
                <div>
                  <span>Cobertura de liquidez</span>
                  <strong>{formatMonths(resilience.liquidityCoverageMonths)}</strong>
                </div>
              </div>

              <p className={styles.note}>
                Ingresos y variación usan los {resilience.observedMonths} mes(es) visibles del
                período seleccionado. Las coberturas usan la planificación actual de {currency} y
                quedan pendientes si falta un gasto esencial mensual explícito.
              </p>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <SectionHeader
            title="Análisis no disponible ahora"
            description="Sin cash flow válido no mostramos gráficos, totales ni tendencias simuladas."
            icon={ShieldCheck}
            domain="finance"
          />
          <p className={styles.empty}>
            Revisá “Datos y fuentes” para ver si la fuente está disponible y qué cobertura existe.
          </p>
        </Card>
      )}
    </div>
  );
}
