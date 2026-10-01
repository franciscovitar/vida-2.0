import { CircleGauge, Landmark, ListChecks, ShieldCheck, WalletCards } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getFinancePlanningStoreSnapshot } from '@/lib/finance/planning-store';
import { getFinanceCashFlowSnapshot } from '@/lib/finance/reporting/cash-flow';
import type { FinanceCashFlowReport } from '@/lib/finance/reporting/cash-flow-core';
import { getFinanceStoreReadinessSnapshot } from '@/lib/finance/store/readiness';
import type { FinanceEconomicRole } from '@/types/finance';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Finanzas' };

const ROLE_LABELS: Partial<Record<FinanceEconomicRole, string>> = {
  income_work: 'Ingresos de trabajo',
  income_family_support: 'Ayuda familiar',
  income_financial: 'Rendimientos',
  expense_personal: 'Gastos personales',
  expense_professional: 'Gastos profesionales',
  refund_adjustment: 'Devoluciones y ajustes',
};

const ROLE_ORDER: FinanceEconomicRole[] = [
  'income_work',
  'income_family_support',
  'income_financial',
  'expense_personal',
  'expense_professional',
  'refund_adjustment',
];

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

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat('es-AR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatDate(date: string): string {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function tone(value: number): 'positive' | 'negative' | 'neutral' {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function currencySummary(report: FinanceCashFlowReport, currency: string) {
  return report.currencies.find((item) => item.currency === currency);
}

export default async function FinanzasPage() {
  const store = await getFinanceStoreReadinessSnapshot();
  const connected = store.status === 'connected';
  const financeReads = connected
    ? await Promise.all([getFinanceCashFlowSnapshot(), getFinancePlanningStoreSnapshot()])
    : null;
  const cashFlow = financeReads?.[0] ?? null;
  const planning = financeReads?.[1] ?? null;
  const report = cashFlow?.ok ? cashFlow.report : null;
  const planningModel = planning?.ok ? planning.model : null;
  const sourceLabel = connected ? 'Store conectado · solo lectura' : store.label;
  const ars = report ? currencySummary(report, 'ARS') : undefined;
  const usd = report ? currencySummary(report, 'USD') : undefined;
  const arsMonths = report?.monthly.filter((row) => row.currency === 'ARS') ?? [];
  const usdMonths = report?.monthly.filter((row) => row.currency === 'USD') ?? [];
  const arsRoles =
    report?.roleTotals
      .filter((row) => row.currency === 'ARS' && ROLE_LABELS[row.role])
      .sort((left, right) => ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role)) ?? [];

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Verdad financiera, cash flow y decisiones con evidencia."
        icon={WalletCards}
        domain="finance"
      />

      <Card className={local.hero} aria-labelledby="finance-status-title">
        <div className={local['hero-top']}>
          <span className={local.status}>
            <span className={local.dot} aria-hidden="true" />
            {report ? 'Reporting activo' : connected ? 'Store validado' : 'Fuente no disponible'}
          </span>
          <span className={local['data-state']}>{sourceLabel}</span>
        </div>
        <div className={local['hero-copy']}>
          <p className={local.eyebrow}>Finance OS V1</p>
          <h2 id="finance-status-title">
            {report
              ? 'Tu cash flow sale del ledger real, no de una estimación.'
              : 'Primero la verdad financiera. Después, las decisiones.'}
          </h2>
          <p>
            {report
              ? 'Vida 2.0 calcula ingresos, gastos, ajustes y resultado por moneda desde el store privado. Transferencias propias, reembolsos, pass-through y pagos de deuda quedan fuera del resultado económico para evitar doble conteo.'
              : connected
                ? 'El store está conectado, pero no se pudo construir el reporte financiero en esta lectura. No se muestran números parciales ni datos inventados.'
                : 'Vida 2.0 no fabrica datos ni usa mocks cuando la fuente financiera no está disponible.'}
          </p>
        </div>
      </Card>

      {report && ars ? (
        <>
          <div className={local['metric-grid']} aria-label="Resumen financiero">
            <Card compact>
              <span className={local['metric-label']}>Resultado ARS</span>
              <strong className={local['metric-value']} data-tone={tone(ars.netMinor)}>
                {formatMinor(ars.netMinor, 'ARS')}
              </strong>
              <small>Ingresos + gastos + devoluciones/ajustes de la cobertura cargada.</small>
            </Card>
            <Card compact>
              <span className={local['metric-label']}>Ingresos ARS</span>
              <strong className={local['metric-value']} data-tone="positive">
                {formatMinor(ars.incomeMinor, 'ARS')}
              </strong>
              <small>Trabajo, ayuda familiar y rendimientos financieros.</small>
            </Card>
            <Card compact>
              <span className={local['metric-label']}>Gastos ARS</span>
              <strong className={local['metric-value']} data-tone="negative">
                {formatMinor(Math.abs(ars.expenseMinor), 'ARS')}
              </strong>
              <small>Gasto personal + profesional. No incluye movimientos neutrales.</small>
            </Card>
            <Card compact>
              <span className={local['metric-label']}>Resultado USD</span>
              <strong className={local['metric-value']} data-tone={tone(usd?.netMinor ?? 0)}>
                {usd ? formatMinor(usd.netMinor, 'USD') : 'Sin datos'}
              </strong>
              <small>Se mantiene separado: no se inventa un tipo de cambio universal.</small>
            </Card>
          </div>

          {planningModel ? (
            <Card aria-labelledby="finance-planning-title">
              <SectionHeader
                id="finance-planning-title"
                title="Planificación y Safe-to-Spend"
                description="Liquidez elegible con calidad y frescura explícitas. Sin una reserva definida, el sistema no inventa capacidad de gasto."
                icon={CircleGauge}
                domain="finance"
              />
              {planningModel.currencies.length > 0 ? (
                <div className={local['role-list']}>
                  {planningModel.currencies.map((item) => (
                    <div key={item.currency} className={local['role-row']}>
                      <div>
                        <strong>
                          {item.snapshot
                            ? `Safe-to-Spend ${item.currency}`
                            : `Liquidez elegible ${item.currency}`}
                        </strong>
                        <small>
                          {item.snapshot
                            ? `${item.commitmentCount} compromisos · ${item.liquidityQuality === 'partial' ? 'evidencia parcial' : 'evidencia verificada'}`
                            : item.status === 'invalid'
                              ? 'Datos de planificación inválidos: revisión requerida.'
                              : item.missing.includes('reserve-policy')
                                ? 'Liquidez trazable; falta una reserva explícita para habilitar Safe-to-Spend.'
                                : 'Falta liquidez elegible antes de calcular Safe-to-Spend.'}
                        </small>
                      </div>
                      <span
                        data-tone={
                          item.snapshot
                            ? tone(item.snapshot.safeToSpend.rawSafeToSpendMinor)
                            : 'neutral'
                        }
                      >
                        {formatMinor(
                          item.snapshot
                            ? item.snapshot.safeToSpend.safeToSpendMinor
                            : item.eligibleLiquidityMinor,
                          item.currency,
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={local['empty-copy']}>
                  No hay cuentas personales inmediatas con una conciliación reciente y confiable.
                </p>
              )}
              <ul className={local.principles}>
                <li>
                  Solo entran cuentas propias, personales e inmediatas cuyo saldo fuente coincide
                  con el ledger.
                </li>
                <li>
                  La evidencia de saldo vence a los {planningModel.maxBalanceAgeDays} días y las
                  obligaciones próximas usan una ventana de {planningModel.obligationHorizonDays}{' '}
                  días.
                </li>
                <li>
                  Cuentas de alcance mixto o conciliaciones conflictivas/viejas quedan fuera de la
                  liquidez elegible.
                </li>
                <li>
                  Sin una reserva explícita —incluso si fuese cero— Safe-to-Spend permanece
                  deshabilitado.
                </li>
              </ul>
              {planningModel.excludedAccounts.length > 0 ? (
                <small>
                  {planningModel.excludedAccounts.length} cuenta(s) propia(s) quedaron fuera de la
                  liquidez elegible por alcance o calidad de evidencia.
                </small>
              ) : null}
            </Card>
          ) : null}

          <Card aria-labelledby="finance-monthly-title">
            <SectionHeader
              id="finance-monthly-title"
              title="Cash flow mensual"
              description="Resultado económico por mes en moneda nativa."
              icon={CircleGauge}
              domain="finance"
            />
            <div className={local['table-wrap']}>
              <table className={local.table}>
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
                  {arsMonths.map((row) => (
                    <tr key={`${row.month}-${row.currency}`}>
                      <th scope="row">{formatMonth(row.month)}</th>
                      <td>{formatMinor(row.incomeMinor, row.currency)}</td>
                      <td>{formatMinor(Math.abs(row.expenseMinor), row.currency)}</td>
                      <td>{formatMinor(row.adjustmentMinor, row.currency)}</td>
                      <td>
                        <strong className={local.net} data-tone={tone(row.netMinor)}>
                          {formatMinor(row.netMinor, row.currency)}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {usdMonths.length > 0 ? (
              <div className={local['secondary-currency']}>
                <span>USD · movimientos económicos cargados</span>
                <div className={local['currency-chips']}>
                  {usdMonths.map((row) => (
                    <span key={row.month} className={local['currency-chip']}>
                      {formatMonth(row.month)} · {formatMinor(row.netMinor, 'USD')}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <div className={local['two-column']}>
            <Card aria-labelledby="finance-composition-title">
              <SectionHeader
                id="finance-composition-title"
                title="Composición ARS"
                description="Qué explica el resultado económico acumulado."
                icon={Landmark}
                domain="finance"
              />
              <div className={local['role-list']}>
                {arsRoles.map((row) => (
                  <div key={row.role} className={local['role-row']}>
                    <div>
                      <strong>{ROLE_LABELS[row.role]}</strong>
                      <small>{row.count} movimientos económicos</small>
                    </div>
                    <span data-tone={tone(row.totalMinor)}>
                      {formatMinor(row.totalMinor, row.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card aria-labelledby="finance-quality-title">
              <SectionHeader
                id="finance-quality-title"
                title="Calidad del ledger"
                description="Los problemas de datos quedan visibles; no se corrigen en silencio."
                icon={ShieldCheck}
                domain="finance"
              />
              <div className={local['quality-grid']}>
                <div>
                  <span>Pendientes</span>
                  <strong
                    data-tone={report.reviewRequiredTransactions === 0 ? 'positive' : 'negative'}
                  >
                    {report.reviewRequiredTransactions}
                  </strong>
                </div>
                <div>
                  <span>Desbalances</span>
                  <strong data-tone={report.unbalancedTransactions === 0 ? 'positive' : 'negative'}>
                    {report.unbalancedTransactions}
                  </strong>
                </div>
                <div>
                  <span>Transacciones</span>
                  <strong>{report.transactionCount}</strong>
                </div>
              </div>
              <div className={local['reconciliation-row']}>
                <span>{report.reconciliation.reconciled} reconciliadas</span>
                <span>{report.reconciliation.partial} parciales</span>
                <span>{report.reconciliation.conflict} en conflicto</span>
              </div>
            </Card>
          </div>

          <Card aria-labelledby="finance-coverage-title">
            <SectionHeader
              id="finance-coverage-title"
              title="Cobertura de fuentes"
              description="Períodos efectivamente cargados en el store. No equivale todavía a toda tu vida financiera."
              icon={ListChecks}
              domain="finance"
            />
            <div className={local['coverage-grid']}>
              {report.coverage.map((item) => (
                <article key={item.accountId} className={local.coverage}>
                  <div>
                    <strong>{item.displayName}</strong>
                    <span>{item.currency}</span>
                  </div>
                  <p>
                    {formatDate(item.periodStart)} → {formatDate(item.periodEnd)}
                  </p>
                  <small>
                    {item.batchCount} lotes · {item.sourceRowCount} movimientos fuente
                  </small>
                </article>
              ))}
            </div>
          </Card>

          <Card aria-labelledby="finance-method-title">
            <SectionHeader
              id="finance-method-title"
              title="Qué queda fuera del resultado"
              description="Movimientos reales que permanecen en el ledger, pero no son ingreso o gasto económico nuevo."
              icon={ShieldCheck}
              domain="finance"
            />
            <ul className={local.principles}>
              <li>Transferencias entre cuentas propias.</li>
              <li>Reembolsos de gastos compartidos.</li>
              <li>Plata de negocio o familia que solo pasó por tus cuentas.</li>
              <li>Pagos de deudas/créditos cuando la compra económica ocurrió antes.</li>
              <li>ARS y USD nunca se mezclan sin una política FX explícita.</li>
            </ul>
          </Card>
        </>
      ) : (
        <Card aria-labelledby="finance-capabilities-title">
          <SectionHeader
            id="finance-capabilities-title"
            title="Reporting financiero no disponible"
            description="La interfaz falla cerrada: sin fuente válida no aparecen números."
            icon={ShieldCheck}
            domain="finance"
          />
          <p className={local['empty-copy']}>
            {cashFlow && !cashFlow.ok
              ? 'La conexión base está disponible, pero alguna tabla necesaria para el cash flow no pudo leerse o validar su schema.'
              : 'Cuando el store vuelva a estar disponible, Vida 2.0 reconstruirá el reporte directamente desde el ledger.'}
          </p>
        </Card>
      )}
    </div>
  );
}
