import { CircleGauge, ListChecks, ShieldCheck, WalletCards } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { FinanceNavigation } from '@/components/finance/FinanceNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { resolveFinanceDataState, type FinanceDataState } from '@/lib/finance/data-state';
import { getFinancePlanningStoreSnapshot } from '@/lib/finance/planning-store';
import type { FinanceLiquidityExclusionReason } from '@/lib/finance/planning-store-core';
import { getFinanceCashFlowSnapshot } from '@/lib/finance/reporting/cash-flow';
import { getFinanceStoreReadinessSnapshot } from '@/lib/finance/store/readiness';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Datos y fuentes · Finanzas' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATUS_LABELS: Record<FinanceDataState, string> = {
  ready: 'Datos al día',
  review: 'Hay datos para revisar',
  partial: 'Cobertura parcial',
  unavailable: 'Fuente no disponible',
};

const EXCLUSION_LABELS: Record<FinanceLiquidityExclusionReason, string> = {
  'non-personal-scope': 'Fuera del alcance personal',
  'non-immediate': 'No es liquidez inmediata',
  'missing-reconciliation': 'Falta conciliación',
  'untrusted-reconciliation': 'Conciliación no confiable',
  'stale-balance': 'Saldo demasiado antiguo',
  'negative-balance': 'Saldo negativo',
};

interface FinanceStatusReport {
  reviewRequiredTransactions: number;
  unknownRoleTransactions: number;
  unbalancedTransactions: number;
  reconciliation: { conflict: number };
}

function statusDescription(state: FinanceDataState, report: FinanceStatusReport | null): string {
  if (state === 'ready') {
    return 'No hay incidencias de calidad que bloqueen la lectura actual.';
  }
  if (state === 'review' && report) {
    const reasons: string[] = [];
    if (report.reconciliation.conflict > 0) {
      reasons.push(
        `${report.reconciliation.conflict} conciliación${report.reconciliation.conflict === 1 ? '' : 'es'} en conflicto`,
      );
    }
    if (report.reviewRequiredTransactions > 0) {
      reasons.push(
        `${report.reviewRequiredTransactions} transacción${report.reviewRequiredTransactions === 1 ? '' : 'es'} pendiente${report.reviewRequiredTransactions === 1 ? '' : 's'} de revisión`,
      );
    }
    if (report.unknownRoleTransactions > 0) {
      reasons.push(
        `${report.unknownRoleTransactions} rol${report.unknownRoleTransactions === 1 ? '' : 'es'} sin clasificar`,
      );
    }
    if (report.unbalancedTransactions > 0) {
      reasons.push(
        `${report.unbalancedTransactions} desbalance${report.unbalancedTransactions === 1 ? '' : 's'}`,
      );
    }
    if (reasons.length > 0) {
      return `El estado requiere revisión por ${reasons.join(', ')}. No se corrigen ni ocultan automáticamente.`;
    }
  }
  if (state === 'review') {
    return 'Hay conflictos o incidencias explícitas. Permanecen visibles en vez de corregirse en silencio.';
  }
  if (state === 'partial') {
    return 'La fuente responde, pero alguna cobertura o conciliación es parcial o incompleta.';
  }
  return 'La fuente financiera no pudo leerse; no se muestran números simulados.';
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

function qualityLabel(value: 'verified' | 'partial' | null): string {
  if (value === 'verified') return 'Verificada';
  if (value === 'partial') return 'Parcial';
  return 'No disponible';
}

export default async function FinanceDataPage() {
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

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Entendé tu mes, tus movimientos y tus decisiones."
        icon={WalletCards}
        domain="finance"
      />

      <FinanceNavigation current="data" dataState={dataState} />

      <Card aria-labelledby="finance-data-status-title">
        <SectionHeader
          id="finance-data-status-title"
          title="Datos y fuentes"
          description="De dónde salen los números, qué cobertura tienen y qué necesita revisión."
          icon={ShieldCheck}
          domain="finance"
        />

        <div className={styles.status} data-state={dataState}>
          <div>
            <span>Estado actual</span>
            <strong>{STATUS_LABELS[dataState]}</strong>
          </div>
          <p>{statusDescription(dataState, report)}</p>
          {report && report.reconciliation.conflict > 0 ? (
            <a className={styles['status-link']} href="#finance-reconciliation-title">
              Ver conciliación ↓
            </a>
          ) : null}
          <small>{connected ? 'Fuente financiera conectada · solo lectura' : store.label}</small>
        </div>
      </Card>

      {report ? (
        <>
          <Card aria-labelledby="finance-data-issues-title">
            <SectionHeader
              id="finance-data-issues-title"
              title="Integridad del registro"
              description="Controles básicos del ledger y de la clasificación financiera."
              icon={ShieldCheck}
              domain="finance"
            />

            <div className={styles['issue-grid']}>
              <div>
                <span>Transacciones pendientes</span>
                <strong data-state={report.reviewRequiredTransactions > 0 ? 'review' : 'ready'}>
                  {report.reviewRequiredTransactions}
                </strong>
              </div>
              <div>
                <span>Roles sin clasificar</span>
                <strong data-state={report.unknownRoleTransactions > 0 ? 'review' : 'ready'}>
                  {report.unknownRoleTransactions}
                </strong>
              </div>
              <div>
                <span>Desbalances</span>
                <strong data-state={report.unbalancedTransactions > 0 ? 'review' : 'ready'}>
                  {report.unbalancedTransactions}
                </strong>
              </div>
              <div>
                <span>Transacciones totales</span>
                <strong>{report.transactionCount}</strong>
              </div>
            </div>
          </Card>

          <Card aria-labelledby="finance-reconciliation-title">
            <SectionHeader
              id="finance-reconciliation-title"
              title="Conciliación"
              description="Los estados parciales y conflictos conocidos permanecen explícitos."
              icon={CircleGauge}
              domain="finance"
            />

            <div className={styles['reconciliation-grid']}>
              <div>
                <span>Reconciliadas</span>
                <strong>{report.reconciliation.reconciled}</strong>
              </div>
              <div>
                <span>Parciales</span>
                <strong>{report.reconciliation.partial}</strong>
              </div>
              <div>
                <span>En conflicto</span>
                <strong data-state={report.reconciliation.conflict > 0 ? 'review' : 'ready'}>
                  {report.reconciliation.conflict}
                </strong>
              </div>
              <div>
                <span>Vencidas</span>
                <strong>{report.reconciliation.stale}</strong>
              </div>
            </div>

            <p className={styles.note}>
              Total de controles de conciliación: {report.reconciliation.total}. Un conflicto no se
              transforma en “correcto” para limpiar la interfaz.
            </p>
          </Card>

          <Card aria-labelledby="finance-coverage-title">
            <SectionHeader
              id="finance-coverage-title"
              title="Cobertura de fuentes"
              description="Períodos efectivamente cargados. No equivalen automáticamente a toda tu historia financiera."
              icon={ListChecks}
              domain="finance"
            />

            {report.coverage.length > 0 ? (
              <div className={styles['coverage-grid']}>
                {report.coverage.map((item) => (
                  <article className={styles.coverage} key={item.accountId}>
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
            ) : (
              <p className={styles.note}>No hay ventanas de cobertura registradas.</p>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <SectionHeader
            title="Reporting no disponible"
            description="La fuente no entregó un reporte válido en esta lectura."
            icon={ShieldCheck}
            domain="finance"
          />
          <p className={styles.note}>
            No completamos huecos con datos estimados. El resto de esta página solo muestra
            evidencia que pudo leerse de forma válida.
          </p>
        </Card>
      )}

      {planningModel ? (
        <Card aria-labelledby="finance-planning-evidence-title">
          <SectionHeader
            id="finance-planning-evidence-title"
            title="Evidencia para planificación"
            description="Qué saldos pueden entrar en la liquidez elegible y con qué reglas de frescura."
            icon={CircleGauge}
            domain="finance"
          />

          <div className={styles['planning-grid']}>
            {planningModel.currencies.map((item) => (
              <div key={item.currency}>
                <div>
                  <strong>{item.currency}</strong>
                  <span>{qualityLabel(item.liquidityQuality)}</span>
                </div>
                <p>
                  {item.includedAccountCount} cuenta(s) incluida(s) · {item.commitmentCount}{' '}
                  compromiso(s)
                </p>
                <small>
                  Estado de planificación:{' '}
                  {item.status === 'ready'
                    ? 'lista'
                    : item.status === 'invalid'
                      ? 'requiere revisión'
                      : 'requiere configuración'}
                  .
                </small>
              </div>
            ))}
          </div>

          <p className={styles.note}>
            Un saldo deja de ser elegible después de {planningModel.maxBalanceAgeDays} días. Las
            obligaciones próximas usan una ventana de {planningModel.obligationHorizonDays} días.
          </p>

          {planningModel.excludedAccounts.length > 0 ? (
            <details className={styles.disclosure}>
              <summary>
                Ver {planningModel.excludedAccounts.length} cuenta(s) excluida(s) de liquidez
              </summary>
              <div className={styles['excluded-list']}>
                {planningModel.excludedAccounts.map((item) => (
                  <div key={item.accountId}>
                    <strong>{item.displayName}</strong>
                    <span>{item.currency}</span>
                    <small>{EXCLUSION_LABELS[item.reason]}</small>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </Card>
      ) : null}

      <Card aria-labelledby="finance-method-title">
        <SectionHeader
          id="finance-method-title"
          title="Qué queda fuera del resultado económico"
          description="Movimientos reales que se conservan, pero no representan ingreso o gasto nuevo."
          icon={ShieldCheck}
          domain="finance"
        />

        <ul className={styles.principles}>
          <li>Transferencias entre cuentas propias.</li>
          <li>Reembolsos de gastos compartidos.</li>
          <li>Plata de negocio o familia que solo pasó por tus cuentas.</li>
          <li>Pagos de deudas o créditos cuando la compra económica ocurrió antes.</li>
          <li>ARS y USD nunca se mezclan sin una política de tipo de cambio explícita.</li>
        </ul>
      </Card>
    </div>
  );
}
