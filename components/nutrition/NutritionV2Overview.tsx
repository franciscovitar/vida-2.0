import {
  Apple,
  BrainCircuit,
  ChevronDown,
  CircleGauge,
  Flame,
  Leaf,
  Microscope,
  ShieldCheck,
  Sparkles,
  Utensils,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import {
  nutritionDisplayDelta,
  nutritionDisplayPointEstimate,
} from '@/lib/nutrition/presentation';
import type {
  NutritionAiInsight,
  NutritionDashboardData,
  NutritionMacroProgress,
  NutritionNutrientValue,
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

function nutrientProgress(nutrient: NutritionNutrientValue): number | null {
  const display = nutritionDisplayPointEstimate(nutrient.amount, nutrient.amountLow, nutrient.amountHigh);
  return percentage(display.value, nutrient.target);
}

function NutrientRow({ nutrient }: { nutrient: NutritionNutrientValue }) {
  const display = nutritionDisplayPointEstimate(nutrient.amount, nutrient.amountLow, nutrient.amountHigh);
  const progress = nutrientProgress(nutrient);
  const style = {
    '--nutrient-progress': `${Math.min(progress ?? 0, 100)}%`,
  } as CSSProperties;
  return (
    <div className={styles['nutrient-row']} data-has-value={display.value !== null}>
      <div className={styles['nutrient-copy']}>
        <strong>{nutrient.name}</strong>
        <span>
          {display.value === null
            ? 'Sin dato'
            : `${display.approximate ? '≈' : ''}${formatNumber(
                display.value,
                display.value < 10 ? 1 : 0,
              )} ${nutrient.unit}`}
        </span>
      </div>
      <div className={styles['nutrient-progress']}>
        <div className={styles.track} aria-hidden="true">
          <span className={styles.fill} style={style} />
        </div>
        <small>
          {display.value === null
            ? nutrient.target === null
              ? coverageLabel(nutrient.sourceCoverage)
              : `Referencia ${formatNumber(
                  nutrient.target,
                  nutrient.target < 10 ? 1 : 0,
                )} ${nutrient.unit}`
            : nutrient.target === null
              ? coverageLabel(nutrient.sourceCoverage)
              : `${progress}% de ${formatNumber(
                  nutrient.target,
                  nutrient.target < 10 ? 1 : 0,
                )} ${nutrient.unit}`}
        </small>
      </div>
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

function weekday(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' })
    .format(parsed)
    .replace('.', '');
}

export function NutritionV2Overview({ data }: { data: NutritionDashboardData }) {
  const targetEnergy = data.target?.energyKcal ?? null;
  const energyDisplay = nutritionDisplayPointEstimate(
    data.todayEnergy.amount,
    data.todayEnergy.low,
    data.todayEnergy.high,
  );
  const energyProgress = percentage(energyDisplay.value, targetEnergy);
  const energyDelta = nutritionDisplayDelta(
    data.todayEnergy.amount,
    data.todayEnergy.low,
    data.todayEnergy.high,
    targetEnergy,
  );
  const ringStyle = {
    '--energy-progress': `${Math.min(energyProgress ?? 0, 100)}%`,
  } as CSSProperties;

  const recent = data.history.slice(-7);
  const scaleMax = Math.max(
    targetEnergy ?? 0,
    ...recent.map((point) => point.energyKcalHigh ?? point.energyKcal ?? point.energyKcalLow ?? 0),
    1,
  );
  const energyCompleteDays = recent.filter((point) => point.energyCoverage === 'complete').length;
  const macroCompleteDays = recent.filter((point) => point.macroCoverage === 'complete').length;
  const lowConfidenceItems = recent.reduce((sum, point) => sum + point.lowConfidenceItemCount, 0);
  const knownNutrients = data.nutrients.filter(
    (nutrient) =>
      nutritionDisplayPointEstimate(nutrient.amount, nutrient.amountLow, nutrient.amountHigh).value !== null,
  );
  const targetedNutrients = data.nutrients.filter((nutrient) => nutrient.target !== null);
  const highlighted = knownNutrients
    .slice()
    .sort((a, b) => (nutrientProgress(a) ?? -1) - (nutrientProgress(b) ?? -1))
    .slice(0, 8);
  const groups = [
    ['vitamin', 'Vitaminas'],
    ['mineral', 'Minerales'],
    ['other', 'Otros nutrientes'],
  ] as const;
  const nutrientTargetsReady = data.optionalSources.nutrientTargets === 'ready';
  const nutrientSummaryReady = data.optionalSources.nutrientSummary === 'ready';
  const nutrientSourcesLabel =
    nutrientTargetsReady && nutrientSummaryReady
      ? 'Activas'
      : nutrientTargetsReady || nutrientSummaryReady
        ? 'Parciales'
        : data.optionalSources.nutrientTargets === 'missing' &&
            data.optionalSources.nutrientSummary === 'missing'
          ? 'Pendientes'
          : 'No disponibles';

  const antioxidant = data.aiInsights.find((insight) => insight.category === 'antioxidants');
  const antiInflammatory = data.aiInsights.find(
    (insight) => insight.category === 'anti-inflammatory',
  );
  const improvement = data.aiInsights.find((insight) => insight.category === 'improvement');
  const pattern = data.aiInsights.find((insight) => insight.category === 'pattern');

  return (
    <div className={styles.stack}>
      <section className={styles.hero} aria-labelledby="nutrition-v2-title">
        <div className={styles['hero-copy']}>
          <p className={styles.eyebrow}>NUTRICIÓN V2 · HOY</p>
          <h2 id="nutrition-v2-title">Tu nutrición, de macros a micros</h2>
          <p>
            Lo registrado en Nutrition Intelligence se transforma en una vista diaria y
            longitudinal. Valores desconocidos siguen siendo desconocidos: no se rellenan huecos con
            ceros.
          </p>
          <div className={styles['source-line']} data-status={data.source.status}>
            <ShieldCheck size={15} aria-hidden="true" />
            <span>{data.source.label}</span>
          </div>
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
                  ? 'meta no registrada'
                  : `${energyProgress}% de ${formatNumber(targetEnergy)} kcal`}
              </span>
            </div>
          </div>
          <div className={styles['energy-meta']}>
            <div>
              <span>Objetivo</span>
              <strong>
                {targetEnergy === null ? 'Pendiente' : `${formatNumber(targetEnergy)} kcal`}
              </strong>
            </div>
            <div>
              <span>Diferencia</span>
              <strong>
                {energyDelta === null
                  ? '—'
                  : energyDelta === 0
                    ? 'En objetivo'
                    : `${energyDelta > 0 ? '+' : ''}${formatNumber(energyDelta)} kcal`}
              </strong>
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

      <section className={styles.panel} aria-labelledby="nutrition-trend-title">
        <div className={styles['section-heading']}>
          <div>
            <p className={styles.eyebrow}>ÚLTIMOS 7 DÍAS</p>
            <h2 id="nutrition-trend-title">Energía y calidad del registro</h2>
            <p>
              La banda muestra el rango cuando existe; el punto representa el valor central
              registrado.
            </p>
          </div>
          <CircleGauge size={21} aria-hidden="true" />
        </div>

        <div className={styles['trend-layout']}>
          <div className={styles.chart}>
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
                const chartStyle = {
                  '--range-low': `${Math.min((low / scaleMax) * 100, 100)}%`,
                  '--range-high': `${Math.min((high / scaleMax) * 100, 100)}%`,
                  '--center': `${Math.min(((center ?? 0) / scaleMax) * 100, 100)}%`,
                  '--target': `${Math.min(((targetEnergy ?? 0) / scaleMax) * 100, 100)}%`,
                } as CSSProperties;
                return (
                  <div className={styles['chart-day']} key={point.date} style={chartStyle}>
                    <div className={styles['chart-column']}>
                      {targetEnergy !== null ? <span className={styles['target-mark']} /> : null}
                      {low > 0 || high > 0 ? <span className={styles['range-mark']} /> : null}
                      {center !== null ? <span className={styles['center-mark']} /> : null}
                    </div>
                    <strong>
                      {center === null
                        ? '—'
                        : `${centerDisplay.approximate ? '≈' : ''}${formatNumber(center)}`}
                    </strong>
                    <span>{weekday(point.date)}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className={styles['quality-grid']}>
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
              <small>ítems en los últimos 7 días</small>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="micronutrients-title">
        <div className={styles['section-heading']}>
          <div>
            <p className={styles.eyebrow}>MICRONUTRIENTES</p>
            <h2 id="micronutrients-title">Vitaminas, minerales y otros nutrientes</h2>
            <p>
              Vida combina cantidades de `Nutrient Summary` con referencias de `Nutrient Targets` y
              mantiene como desconocido cualquier valor que Nutrition Intelligence todavía no haya
              cuantificado.
            </p>
          </div>
          <Microscope size={21} aria-hidden="true" />
        </div>

        <div className={styles['nutrient-summary']}>
          <article>
            <span>Con datos hoy</span>
            <strong>{knownNutrients.length}</strong>
            <small>de {data.nutrients.length} nutrientes visibles</small>
          </article>
          <article>
            <span>Con objetivo</span>
            <strong>{targetedNutrients.length}</strong>
            <small>referencias activas cargadas en el store</small>
          </article>
          <article>
            <span>Fuentes de micros</span>
            <strong>{nutrientSourcesLabel}</strong>
            <small>resumen diario + referencias de objetivos</small>
          </article>
        </div>

        {highlighted.length > 0 ? (
          <div className={styles['highlight-grid']}>
            {highlighted.map((nutrient) => (
              <article key={nutrient.key} className={styles.highlight}>
                <span>{nutrient.name}</span>
                <strong>
                  {(() => {
                    const display = nutritionDisplayPointEstimate(
                      nutrient.amount,
                      nutrient.amountLow,
                      nutrient.amountHigh,
                    );
                    return display.value === null
                      ? 'Sin dato'
                      : `${display.approximate ? '≈' : ''}${formatNumber(
                          display.value,
                          display.value < 10 ? 1 : 0,
                        )} ${nutrient.unit}`;
                  })()}
                </strong>
                <small>
                  {nutrient.target === null
                    ? coverageLabel(nutrient.sourceCoverage)
                    : `${nutrientProgress(nutrient)}% del objetivo`}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles['micro-empty']}>
            <Leaf size={22} aria-hidden="true" />
            <div>
              <strong>
                Las referencias ya están listas; faltan valores micronutricionales de consumo.
              </strong>
              <p>
                Cuando Nutrition Intelligence complete `Nutrient Summary`, las cantidades aparecerán
                acá contra sus referencias sin necesidad de cambiar la pantalla.
              </p>
            </div>
          </div>
        )}

        <details className={styles.details}>
          <summary>
            <span>Ver todos los nutrientes ({data.nutrients.length})</span>
            <ChevronDown size={17} aria-hidden="true" />
          </summary>
          <div className={styles['nutrient-groups']}>
            {groups.map(([group, label]) => (
              <section key={group}>
                <h3>{label}</h3>
                <div className={styles['nutrient-list']}>
                  {data.nutrients
                    .filter((nutrient) => nutrient.group === group)
                    .map((nutrient) => (
                      <NutrientRow key={nutrient.key} nutrient={nutrient} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </details>
      </section>

      {data.aiInsights.length > 0 ? (
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
          {antioxidant ? (
            <InsightCard
              icon={<Sparkles size={17} aria-hidden="true" />}
              title="Potencial antioxidante"
              insight={antioxidant}
            />
          ) : null}
          {antiInflammatory ? (
            <InsightCard
              icon={<Leaf size={17} aria-hidden="true" />}
              title="Perfil antiinflamatorio"
              insight={antiInflammatory}
            />
          ) : null}
          {improvement ? (
            <InsightCard
              icon={<Flame size={17} aria-hidden="true" />}
              title="Mejora de mayor impacto"
              insight={improvement}
            />
          ) : null}
          {pattern ? (
            <InsightCard
              icon={<BrainCircuit size={17} aria-hidden="true" />}
              title="Patrón observado"
              insight={pattern}
            />
          ) : null}
        </div>
        </section>
      ) : null}

      <section className={styles.panel} aria-labelledby="nutrition-meals-title">
        <div className={styles['section-heading']}>
          <div>
            <p className={styles.eyebrow}>REGISTRO DE HOY</p>
            <h2 id="nutrition-meals-title">Comidas registradas</h2>
            <p>Resumen derivado de Meals + Food Items, preservando rangos y confianza.</p>
          </div>
          <Utensils size={21} aria-hidden="true" />
        </div>

        {data.meals.length === 0 ? (
          <div className={styles['meal-empty']}>
            <Apple size={20} aria-hidden="true" />
            <span>No hay comidas registradas para hoy.</span>
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
