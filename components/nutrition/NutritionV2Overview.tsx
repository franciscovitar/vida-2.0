import {
  Apple,
  BrainCircuit,
  CircleGauge,
  Flame,
  Leaf,
  ShieldCheck,
  Sparkles,
  Utensils,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import {
  nutritionDisplayDeltaToTarget,
  nutritionDisplayPointEstimate,
} from '@/lib/nutrition/presentation';
import type {
  NutritionAiInsight,
  NutritionDailyPoint,
  NutritionDashboardData,
  NutritionMacroProgress,
} from '@/lib/nutrition/types';

import styles from './NutritionV2Overview.module.scss';

function formatNumber(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatEnergyEstimate(
  amount: number | null,
  low: number | null,
  high: number | null,
): string {
  const display = nutritionDisplayPointEstimate(amount, low, high);
  if (display.value === null) return 'Sin total todavía';
  return `${display.approximate ? '≈' : ''}${formatNumber(display.value)} kcal`;
}

function formatEnergy(data: NutritionDashboardData['todayEnergy']): string {
  return formatEnergyEstimate(data.amount, data.low, data.high);
}

function energyTargetLabel(
  central: number | null,
  low: number | null,
  high: number | null,
): string | null {
  if (low !== null && high !== null && low > high) return null;
  if (central !== null) {
    if (low !== null && high !== null && (low !== central || high !== central)) {
      return `${formatNumber(central)} kcal · rango ${formatNumber(low)}–${formatNumber(high)}`;
    }
    return `${formatNumber(central)} kcal`;
  }
  if (low !== null && high !== null) {
    return `${formatNumber(low)}–${formatNumber(high)} kcal`;
  }
  if (low !== null) return `≥ ${formatNumber(low)} kcal`;
  if (high !== null) return `≤ ${formatNumber(high)} kcal`;
  return null;
}

function formatEnergyTarget(target: NutritionDashboardData['target']): string {
  if (!target) return 'Pendiente';
  return (
    energyTargetLabel(target.energyKcal, target.energyKcalLow, target.energyKcalHigh) ?? 'Pendiente'
  );
}

function historicalEnergyTargetLabel(point: NutritionDailyPoint): string {
  return (
    energyTargetLabel(
      point.energyTargetKcal,
      point.energyTargetKcalLow,
      point.energyTargetKcalHigh,
    ) ?? 'Sin objetivo registrado'
  );
}

function energyDifferenceLabel(
  data: NutritionDashboardData['todayEnergy'],
  target: NutritionDashboardData['target'],
): string {
  if (!target) return '—';
  const delta = nutritionDisplayDeltaToTarget(
    data.amount,
    data.low,
    data.high,
    target.energyKcal,
    target.energyKcalLow,
    target.energyKcalHigh,
  );
  if (delta === null) return '—';

  const rangeTarget =
    target.energyKcal === null &&
    (target.energyKcalLow !== null || target.energyKcalHigh !== null);
  if (delta === 0) return rangeTarget ? 'En rango' : 'En objetivo';
  if (!rangeTarget) return `${delta > 0 ? '+' : ''}${formatNumber(delta)} kcal`;
  return delta < 0
    ? `${formatNumber(delta)} kcal hasta rango`
    : `+${formatNumber(delta)} kcal sobre rango`;
}

function percentage(amount: number | null, target: number | null): number | null {
  if (amount === null || target === null || target <= 0) return null;
  return Math.max(0, Math.round((amount / target) * 100));
}

function coverageLabel(coverage: string): string {
  if (coverage === 'complete') return 'completo';
  if (coverage === 'partial') return 'parcial';
  if (coverage === 'none') return 'sin datos';
  return 'cobertura desconocida';
}

function qualityLabel(quality: string): string {
  if (quality === 'high') return 'Alta';
  if (quality === 'medium') return 'Media';
  if (quality === 'low') return 'Baja';
  if (quality === 'mixed') return 'Mixta';
  return 'Sin clasificar';
}

function MacroBar({ macro }: { macro: NutritionMacroProgress }) {
  const progress = percentage(macro.amount, macro.target);
  const style = {
    '--macro-progress': `${Math.min(progress ?? 0, 100)}%`,
  } as CSSProperties;

  return (
    <article className={styles.macro} data-coverage={macro.coverage}>
      <div className={styles['macro-heading']}>
        <div>
          <span>{macro.label}</span>
          <strong>
            {macro.amount === null
              ? '—'
              : `${macro.approximate ? '≈' : ''}${formatNumber(
                  macro.amount,
                  macro.approximate ? 0 : 1,
                )} g`}
            {macro.approximate ? (
              <small> estimado · calidad {qualityLabel(macro.estimateQuality).toLowerCase()}</small>
            ) : macro.coverage === 'partial' ? (
              <small> conocidos</small>
            ) : null}
          </strong>
        </div>
        <span className={styles['coverage-chip']}>{coverageLabel(macro.coverage)}</span>
      </div>
      <div className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={style} />
      </div>
      <div className={styles['macro-footer']}>
        <span>
          {macro.target === null ? 'Objetivo pendiente' : `Meta ${formatNumber(macro.target)} g`}
        </span>
        <span>{progress === null ? '—' : `${progress}%`}</span>
      </div>
    </article>
  );
}

function SourceStatus({ source }: { source: NutritionDashboardData['source'] }) {
  return (
    <div
      className={styles['source-line']}
      data-status={source.status}
      data-freshness={source.freshness}
    >
      <ShieldCheck size={15} aria-hidden="true" />
      <span>
        {source.label}
        {source.freshness === 'stale'
          ? ' · resumen desactualizado'
          : source.freshness === 'historical'
            ? ' · día histórico'
            : ''}
      </span>
    </div>
  );
}

function InsightCard({
  icon,
  title,
  insight,
}: {
  icon: ReactNode;
  title: string;
  insight: NutritionAiInsight;
}) {
  return (
    <article className={styles.insight} data-tone={insight.tone}>
      <span className={styles['insight-icon']}>{icon}</span>
      <div>
        <small>{title}</small>
        <strong>{insight.title}</strong>
        <p>{insight.detail}</p>
        <span className={styles.evidence}>
          Confianza {qualityLabel(insight.confidence).toLowerCase()}
          {insight.window ? ` · ${insight.window}` : ''}
        </span>
        {insight.evidence ? <span className={styles.evidence}>{insight.evidence}</span> : null}
        {insight.limitations ? <span className={styles.evidence}>{insight.limitations}</span> : null}
      </div>
    </article>
  );
}

function todayStatusCopy(status: NutritionDashboardData['todayEnergy']['dayStatus']): string {
  if (status === 'open') return 'Registro abierto: este resumen puede seguir cambiando hoy.';
  if (status === 'closed') {
    return 'Día cerrado para registro; las correcciones posteriores siguen siendo posibles.';
  }
  return 'Resumen derivado de lo registrado para este día.';
}

function insightLabel(insight: NutritionAiInsight): string {
  if (insight.category === 'improvement') return 'Mejora de mayor impacto';
  if (insight.category === 'pattern') return 'Patrón observado';
  if (insight.category === 'antioxidants') return 'Potencial antioxidante';
  return 'Perfil antiinflamatorio';
}

function insightIcon(insight: NutritionAiInsight): ReactNode {
  if (insight.category === 'improvement') return <Flame size={17} aria-hidden="true" />;
  if (insight.category === 'pattern') return <BrainCircuit size={17} aria-hidden="true" />;
  if (insight.category === 'antioxidants') return <Sparkles size={17} aria-hidden="true" />;
  return <Leaf size={17} aria-hidden="true" />;
}

function weekday(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' })
    .format(parsed)
    .replace('.', '');
}

function shortTrendDate(date: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

export type NutritionOverviewMode = 'today' | 'trends';

export function NutritionV2Overview({
  data,
  mode = 'today',
  windowDays = 28,
}: {
  data: NutritionDashboardData;
  mode?: NutritionOverviewMode;
  windowDays?: 7 | 28 | 90;
}) {
  const historicalDay = data.source.freshness === 'historical';
  const targetEnergy = data.target?.energyKcal ?? null;
  const energyDisplay = nutritionDisplayPointEstimate(
    data.todayEnergy.amount,
    data.todayEnergy.low,
    data.todayEnergy.high,
  );
  const energyProgress = percentage(energyDisplay.value, targetEnergy);
  const targetEnergyLabel = formatEnergyTarget(data.target);
  const energyDifference = energyDifferenceLabel(data.todayEnergy, data.target);
  const ringStyle = {
    '--energy-progress': `${Math.min(energyProgress ?? 0, 100)}%`,
  } as CSSProperties;

  const recent = data.history.slice(-windowDays);
  const trendStyle = {
    '--trend-columns': Math.max(recent.length, 1),
  } as CSSProperties;
  const comparableEnergy = recent
    .filter((point) => point.energyCoverage === 'complete')
    .map((point) =>
      nutritionDisplayPointEstimate(
        point.energyKcal,
        point.energyKcalLow,
        point.energyKcalHigh,
      ),
    )
    .filter(
      (
        point,
      ): point is {
        value: number;
        approximate: boolean;
      } => point.value !== null,
    );
  const averageEnergy =
    comparableEnergy.length > 0
      ? comparableEnergy.reduce((sum, point) => sum + point.value, 0) / comparableEnergy.length
      : null;
  const averageEnergyApproximate = comparableEnergy.some((point) => point.approximate);
  const scaleMax = Math.max(
    ...recent.map((point) => point.energyKcalHigh ?? point.energyKcal ?? point.energyKcalLow ?? 0),
    ...recent.map(
      (point) =>
        point.energyTargetKcalHigh ?? point.energyTargetKcal ?? point.energyTargetKcalLow ?? 0,
    ),
    1,
  );
  const targetDecisionCount = new Set(
    recent
      .map((point) => point.targetDecisionId)
      .filter((decisionId): decisionId is string => Boolean(decisionId)),
  ).size;
  const energyCompleteDays = recent.filter((point) => point.energyCoverage === 'complete').length;
  const macroCompleteDays = recent.filter((point) => point.macroCoverage === 'complete').length;
  const lowConfidenceItems = recent.reduce((sum, point) => sum + point.lowConfidenceItemCount, 0);
  const improvement = data.aiInsights.find((insight) => insight.category === 'improvement');
  const pattern = data.aiInsights.find((insight) => insight.category === 'pattern');
  const antioxidant = data.aiInsights.find((insight) => insight.category === 'antioxidants');
  const antiInflammatory = data.aiInsights.find(
    (insight) => insight.category === 'anti-inflammatory',
  );
  const todayInsight = improvement ?? pattern ?? antioxidant ?? antiInflammatory;

  return (
    <div className={styles.stack}>
      {mode !== 'today' ? <SourceStatus source={data.source} /> : null}

      <section
        className={styles.hero}
        hidden={mode !== 'today'}
        aria-labelledby="nutrition-v2-title"
      >
        <div className={styles['hero-copy']}>
          <p className={styles.eyebrow}>{historicalDay ? 'DÍA SELECCIONADO' : 'HOY'}</p>
          <h2 id="nutrition-v2-title">Estado del día</h2>
          <p>{todayStatusCopy(data.todayEnergy.dayStatus)}</p>
          <SourceStatus source={data.source} />
        </div>

        <div className={styles['energy-summary']}>
          <div
            className={styles['energy-ring']}
            style={ringStyle}
            aria-label="Progreso de calorías"
          >
            <div>
              <small>Consumidas</small>
              <strong>{formatEnergy(data.todayEnergy)}</strong>
              <span>
                {energyProgress === null
                  ? targetEnergyLabel === 'Pendiente'
                    ? 'meta no registrada'
                    : `objetivo ${targetEnergyLabel}`
                  : `${energyProgress}% de ${formatNumber(targetEnergy)} kcal`}
              </span>
            </div>
          </div>
          <div className={styles['energy-meta']}>
            <div>
              <span>Objetivo</span>
              <strong>{targetEnergyLabel}</strong>
            </div>
            <div>
              <span>Diferencia</span>
              <strong>{energyDifference}</strong>
            </div>
            <div>
              <span>Calidad</span>
              <strong>{qualityLabel(data.todayEnergy.quality)}</strong>
            </div>
            {data.todayEnergy.low !== null && data.todayEnergy.high !== null ? (
              <div>
                <span>Rango</span>
                <strong>
                  {formatNumber(data.todayEnergy.low)}–{formatNumber(data.todayEnergy.high)} kcal
                </strong>
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles['macro-grid']}>
          {data.macros.map((macro) => (
            <MacroBar key={macro.key} macro={macro} />
          ))}
        </div>
      </section>

      <section
        className={styles.panel}
        hidden={mode !== 'trends'}
        aria-labelledby="nutrition-trend-title"
      >
        <div className={styles['section-heading']}>
          <div>
            <p className={styles.eyebrow}>ÚLTIMOS {windowDays} DÍAS</p>
            <h2 id="nutrition-trend-title">Energía y calidad del registro</h2>
            <p>
              La banda azul muestra el rango de ingesta; la referencia punteada o sombreada usa el
              objetivo vigente de cada fecha.
              {targetDecisionCount > 1
                ? ` En este período hubo ${targetDecisionCount} decisiones de objetivo.`
                : ''}
            </p>
          </div>
          <CircleGauge size={21} aria-hidden="true" />
        </div>

        <div className={styles['trend-layout']}>
          <div className={styles.chart} style={trendStyle}>
            {recent.length === 0 ? (
              <p className={styles.empty}>Todavía no hay historial diario para graficar.</p>
            ) : (
              recent.map((point) => {
                const low = point.energyKcalLow ?? point.energyKcal ?? 0;
                const high = point.energyKcalHigh ?? point.energyKcal ?? low;
                const centerDisplay = nutritionDisplayPointEstimate(
                  point.energyKcal,
                  point.energyKcalLow,
                  point.energyKcalHigh,
                );
                const center = centerDisplay.value;
                const targetLow = point.energyTargetKcalLow;
                const targetHigh = point.energyTargetKcalHigh;
                const targetLine =
                  point.energyTargetKcal ??
                  (targetLow !== null && targetHigh === null
                    ? targetLow
                    : targetHigh !== null && targetLow === null
                      ? targetHigh
                      : null);
                const hasTargetRange =
                  targetLow !== null && targetHigh !== null && targetHigh > targetLow;
                const targetLabel = historicalEnergyTargetLabel(point);
                const chartStyle = {
                  '--range-low': `${Math.min((low / scaleMax) * 100, 100)}%`,
                  '--range-high': `${Math.min((high / scaleMax) * 100, 100)}%`,
                  '--center': `${Math.min(((center ?? 0) / scaleMax) * 100, 100)}%`,
                  '--target': `${Math.min(((targetLine ?? 0) / scaleMax) * 100, 100)}%`,
                  '--target-low': `${Math.min(((targetLow ?? 0) / scaleMax) * 100, 100)}%`,
                  '--target-high': `${Math.min(((targetHigh ?? 0) / scaleMax) * 100, 100)}%`,
                } as CSSProperties;
                return (
                  <div
                    className={styles['chart-day']}
                    key={point.date}
                    style={chartStyle}
                    title={`Objetivo histórico: ${targetLabel}`}
                  >
                    <div className={styles['chart-column']}>
                      {hasTargetRange ? (
                        <span className={styles['target-range-mark']} />
                      ) : null}
                      {targetLine !== null ? <span className={styles['target-mark']} /> : null}
                      {low > 0 || high > 0 ? <span className={styles['range-mark']} /> : null}
                      {center !== null ? <span className={styles['center-mark']} /> : null}
                    </div>
                    <strong>
                      {center === null
                        ? '—'
                        : `${centerDisplay.approximate ? '≈' : ''}${formatNumber(center)}`}
                    </strong>
                    <span>{windowDays === 7 ? weekday(point.date) : shortTrendDate(point.date)}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className={styles['quality-grid']}>
            <article>
              <span>Energía media</span>
              <strong>
                {averageEnergy === null
                  ? '—'
                  : `${averageEnergyApproximate ? '≈' : ''}${formatNumber(averageEnergy)} kcal`}
              </strong>
              <small>
                {comparableEnergy.length}/{recent.length} días comparables
              </small>
            </article>
            <article>
              <span>Energía completa</span>
              <strong>
                {recent.length === 0 ? '—' : `${energyCompleteDays}/${recent.length}`}
              </strong>
              <small>días con cobertura completa</small>
            </article>
            <article>
              <span>Macros completos</span>
              <strong>{recent.length === 0 ? '—' : `${macroCompleteDays}/${recent.length}`}</strong>
              <small>sin alimentos relevantes faltantes</small>
            </article>
            <article>
              <span>Baja confianza</span>
              <strong>{lowConfidenceItems}</strong>
              <small>ítems en los últimos {windowDays} días</small>
            </article>
          </div>
        </div>
      </section>

      {mode === 'today' && todayInsight ? (
        <section className={styles.panel} aria-labelledby="nutrition-ai-title">
          <div className={styles['section-heading']}>
            <div>
              <p className={styles.eyebrow}>QUÉ MERECE ATENCIÓN</p>
              <h2 id="nutrition-ai-title">Oportunidades y patrones</h2>
              <p>
                Solo aparecen conclusiones persistidas por Nutrition Intelligence cuando existe
                evidencia suficiente para mostrarlas.
              </p>
            </div>
            <BrainCircuit size={21} aria-hidden="true" />
          </div>
          <div className={styles['insight-grid']}>
            <InsightCard
              icon={insightIcon(todayInsight)}
              title={insightLabel(todayInsight)}
              insight={todayInsight}
            />
          </div>
        </section>
      ) : null}

      <section
        className={styles.panel}
        hidden={mode !== 'today'}
        aria-labelledby="nutrition-meals-title"
      >
        <div className={styles['section-heading']}>
          <div>
            <p className={styles.eyebrow}>REGISTRO DEL DÍA</p>
            <h2 id="nutrition-meals-title">Comidas registradas</h2>
            <p>Resumen derivado de Meals + Food Items, preservando rangos y confianza.</p>
          </div>
          <Utensils size={21} aria-hidden="true" />
        </div>

        {data.meals.length === 0 ? (
          <div className={styles['meal-empty']}>
            <Apple size={20} aria-hidden="true" />
            <span>No hay comidas registradas para este día.</span>
          </div>
        ) : (
          <div className={styles['meal-list']}>
            {data.meals.map((meal) => (
              <article className={styles.meal} key={meal.mealId}>
                <div className={styles['meal-time']}>
                  <span>{meal.timeLabel ?? '—'}</span>
                  <small>{meal.mealType === 'unknown' ? 'comida' : meal.mealType}</small>
                </div>
                <div className={styles['meal-copy']}>
                  <strong>{meal.title}</strong>
                  <span>
                    {meal.foodNames.length > 3
                      ? `+ ${meal.foodNames.length - 3} alimento(s) más`
                      : `${meal.foodNames.length} alimento(s)`}
                  </span>
                </div>
                <div className={styles['meal-energy']}>
                  <strong>
                    {formatEnergyEstimate(
                      meal.energyKcal,
                      meal.energyKcalLow,
                      meal.energyKcalHigh,
                    )}
                  </strong>
                  <span data-confidence={meal.confidence}>
                    {meal.energyKcal === null &&
                    meal.energyKcalLow !== null &&
                    meal.energyKcalHigh !== null
                      ? `${formatNumber(meal.energyKcalLow)}–${formatNumber(
                          meal.energyKcalHigh,
                        )} · ${meal.confidence}`
                      : meal.confidence}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
