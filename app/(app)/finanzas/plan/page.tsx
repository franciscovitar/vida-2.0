import { CircleGauge, ShieldCheck, WalletCards } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { FinanceNavigation } from '@/components/finance/FinanceNavigation';
import { IrregularIncomePlanner } from '@/components/finance/IrregularIncomePlanner';
import { PlanningDraftSandbox } from '@/components/finance/PlanningDraftSandbox';
import { PlanningSubtractionTrace } from '@/components/finance/PlanningSubtractionTrace';
import { PurchaseScenarioCalculator } from '@/components/finance/PurchaseScenarioCalculator';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { resolveFinanceDataState } from '@/lib/finance/data-state';
import { buildFinanceIrregularIncomeProfile } from '@/lib/finance/irregular-income-core';
import { getFinancePlanningStoreSnapshot } from '@/lib/finance/planning-store';
import type { FinancePlanningCurrencyModel } from '@/lib/finance/planning-store-core';
import { getFinanceCashFlowSnapshot } from '@/lib/finance/reporting/cash-flow';
import { getFinanceStoreReadinessSnapshot } from '@/lib/finance/store/readiness';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Plan · Finanzas' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

function qualityLabel(value: FinancePlanningCurrencyModel['liquidityQuality']): string {
  if (value === 'verified') return 'Saldo verificado';
  if (value === 'partial') return 'Cobertura parcial';
  return 'Sin saldo elegible';
}

function overviewCopy(item: FinancePlanningCurrencyModel): string {
  if (item.status === 'invalid') {
    return 'Hay datos de planificación que necesitan revisión.';
  }
  if (item.missing.includes('eligible-liquidity')) {
    return 'Falta una base de liquidez elegible para calcular capacidad.';
  }
  if (item.missing.includes('reserve-policy')) {
    return 'Falta definir una reserva explícita para habilitar Safe-to-Spend.';
  }
  return `${item.commitmentCount} compromiso(s) activos incluidos en el cálculo.`;
}

function CurrencyOverview({ item }: { item: FinancePlanningCurrencyModel }) {
  const snapshot = item.snapshot;
  const primaryValue = snapshot
    ? snapshot.safeToSpend.safeToSpendMinor
    : item.eligibleLiquidityMinor;

  return (
    <article className={styles.currency}>
      <div className={styles['currency-heading']}>
        <strong>{item.currency}</strong>
        <span data-state={item.status}>{qualityLabel(item.liquidityQuality)}</span>
      </div>

      <div className={styles['currency-value']}>
        <span>{snapshot ? 'Safe-to-Spend' : 'Liquidez elegible'}</span>
        <strong>{formatMinor(primaryValue, item.currency)}</strong>
      </div>

      <p>{overviewCopy(item)}</p>
    </article>
  );
}

function PlanningCurrencySection({
  item,
  obligationHorizonDays,
}: {
  item: FinancePlanningCurrencyModel;
  obligationHorizonDays: number;
}) {
  const snapshot = item.snapshot;

  if (snapshot) {
    return (
      <Card
        aria-labelledby={`finance-safe-to-spend-${item.currency}`}
        key={`safe-${item.currency}`}
      >
        <SectionHeader
          id={`finance-safe-to-spend-${item.currency}`}
          title={`Safe-to-Spend · ${item.currency}`}
          description="Disponible no comprometido después de restar reservas y compromisos explícitos."
          icon={ShieldCheck}
          domain="finance"
        />

        <div className={styles['safe-layout']}>
          <div className={styles['safe-hero']}>
            <span>Disponible no comprometido</span>
            <strong>{formatMinor(snapshot.safeToSpend.safeToSpendMinor, snapshot.currency)}</strong>
            <small>Es una lectura descriptiva de capacidad, no una recomendación de gastar.</small>
          </div>

          <dl className={styles.metrics}>
            <div>
              <dt>Liquidez elegible</dt>
              <dd>{formatMinor(snapshot.safeToSpend.eligibleLiquidityMinor, snapshot.currency)}</dd>
            </div>
            <div>
              <dt>Reserva protegida</dt>
              <dd>
                − {formatMinor(snapshot.commitments.protectedReserveMinor, snapshot.currency)}
              </dd>
            </div>
            <div>
              <dt>Obligaciones próximas</dt>
              <dd>
                − {formatMinor(snapshot.commitments.upcomingObligationsMinor, snapshot.currency)}
              </dd>
            </div>
            <div>
              <dt>Metas comprometidas</dt>
              <dd>
                − {formatMinor(snapshot.commitments.committedGoalFundingMinor, snapshot.currency)}
              </dd>
            </div>
            <div>
              <dt>Otros compromisos</dt>
              <dd>
                − {formatMinor(snapshot.commitments.otherCommitmentsMinor, snapshot.currency)}
              </dd>
            </div>
          </dl>
        </div>

        <details className={styles.disclosure}>
          <summary>Cómo se calcula</summary>
          <PlanningSubtractionTrace snapshot={snapshot} />
        </details>
      </Card>
    );
  }

  if (item.status === 'invalid') {
    return (
      <Card
        aria-labelledby={`finance-plan-review-${item.currency}`}
        key={`review-${item.currency}`}
      >
        <SectionHeader
          id={`finance-plan-review-${item.currency}`}
          title={`Planificación · ${item.currency}`}
          description="Hay información que debe revisarse antes de calcular Safe-to-Spend."
          icon={ShieldCheck}
          domain="finance"
        />
        <p className={styles.empty}>
          No reemplazamos datos inválidos con supuestos. Revisá “Datos y fuentes” antes de usar esta
          moneda para decisiones.
        </p>
      </Card>
    );
  }

  const needsLiquidity = item.missing.includes('eligible-liquidity');
  const missingTitle = item.missing.includes('reserve-policy')
    ? 'Falta definir tu reserva'
    : 'Falta liquidez elegible';
  const missingCopy = needsLiquidity
    ? 'Primero necesitamos una conciliación reciente y confiable de una cuenta personal inmediata.'
    : 'Una reserva de cero también es válida, pero tiene que ser una decisión explícita.';

  return (
    <Card aria-labelledby={`finance-plan-config-${item.currency}`} key={`config-${item.currency}`}>
      <SectionHeader
        id={`finance-plan-config-${item.currency}`}
        title={`Safe-to-Spend · ${item.currency}`}
        description="El cálculo permanece deshabilitado hasta que existan los datos mínimos explícitos."
        icon={ShieldCheck}
        domain="finance"
      />

      <div className={styles.missing}>
        <div>
          <span>{missingTitle}</span>
          <strong>{formatMinor(item.eligibleLiquidityMinor, item.currency)}</strong>
          <small>Liquidez elegible actual</small>
        </div>
        <p>{missingCopy}</p>
      </div>

      {!needsLiquidity && item.eligibleLiquidityMinor > 0 ? (
        <details className={styles.disclosure}>
          <summary>Configurar planificación</summary>
          <PlanningDraftSandbox
            currency={item.currency}
            eligibleLiquidityMinor={item.eligibleLiquidityMinor}
            obligationHorizonDays={obligationHorizonDays}
            liquidityQuality={item.liquidityQuality}
          />
        </details>
      ) : null}
    </Card>
  );
}

export default async function FinancePlanPage() {
  const store = await getFinanceStoreReadinessSnapshot();
  const connected = store.status === 'connected';
  const reads = connected
    ? await Promise.all([getFinancePlanningStoreSnapshot(), getFinanceCashFlowSnapshot()])
    : null;
  const planning = reads?.[0] ?? null;
  const cashFlow = reads?.[1] ?? null;
  const model = planning?.ok ? planning.model : null;
  const report = cashFlow?.ok ? cashFlow.report : null;
  const arsPlanning = model?.currencies.find((item) => item.currency === 'ARS') ?? null;
  const irregularIncome = report ? buildFinanceIrregularIncomeProfile(report, 'ARS') : null;
  const dataState = resolveFinanceDataState({ connected, report });

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Entendé tu mes, tus movimientos y tus decisiones."
        icon={WalletCards}
        domain="finance"
      />

      <FinanceNavigation current="plan" dataState={dataState} />

      {model ? (
        <>
          <Card aria-labelledby="finance-plan-overview-title">
            <SectionHeader
              id="finance-plan-overview-title"
              title="Plan"
              description="Qué parte de tu liquidez está libre, protegida o todavía necesita configuración."
              icon={CircleGauge}
              domain="finance"
            />

            {model.currencies.length > 0 ? (
              <div className={styles['currency-grid']}>
                {model.currencies.map((item) => (
                  <CurrencyOverview item={item} key={item.currency} />
                ))}
              </div>
            ) : (
              <p className={styles.empty}>
                No hay una base de liquidez personal inmediata disponible para construir el plan.
              </p>
            )}
          </Card>

          {model.currencies.map((item) => (
            <PlanningCurrencySection
              item={item}
              key={item.currency}
              obligationHorizonDays={model.obligationHorizonDays}
            />
          ))}

          <Card aria-labelledby="finance-purchase-title">
            <SectionHeader
              id="finance-purchase-title"
              title="Evaluar una compra"
              description="Probá el impacto sobre tu capacidad calculada sin guardar ni ejecutar nada."
              icon={WalletCards}
              domain="finance"
            />

            {model.currencies.some((item) => item.snapshot) ? (
              <div className={styles['scenario-list']}>
                {model.currencies.map((item) => {
                  const snapshot = item.snapshot;
                  if (!snapshot) return null;

                  return (
                    <div key={`purchase-${item.currency}`}>
                      <PurchaseScenarioCalculator
                        source={{
                          currency: item.currency,
                          safeToSpend: snapshot.safeToSpend,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.empty}>
                La evaluación de compras se habilita cuando Safe-to-Spend está configurado para una
                moneda.
              </p>
            )}
          </Card>

          {irregularIncome && irregularIncome.completeMonthCount > 0 ? (
            <Card aria-labelledby="finance-variable-income-title">
              <SectionHeader
                id="finance-variable-income-title"
                title="Ingresos variables"
                description="Usá tu historial completo como contexto y probá un escenario de mes austero."
                icon={CircleGauge}
                domain="finance"
              />
              <IrregularIncomePlanner
                profile={irregularIncome}
                eligibleLiquidityMinor={arsPlanning?.eligibleLiquidityMinor ?? 0}
              />
            </Card>
          ) : (
            <Card aria-labelledby="finance-variable-income-title">
              <SectionHeader
                id="finance-variable-income-title"
                title="Ingresos variables"
                description="Necesita meses completos comparables antes de estimar un escenario."
                icon={CircleGauge}
                domain="finance"
              />
              <p className={styles.empty}>
                Todavía no hay suficiente cobertura histórica común para mostrar este análisis sin
                completar huecos con supuestos.
              </p>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <SectionHeader
            title="Plan no disponible ahora"
            description="Sin una lectura válida de la fuente financiera no mostramos capacidad simulada."
            icon={ShieldCheck}
            domain="finance"
          />
          <p className={styles.empty}>
            Tus datos no fueron reemplazados por valores inventados. Podés revisar el estado desde
            “Datos y fuentes”.
          </p>
        </Card>
      )}
    </div>
  );
}
