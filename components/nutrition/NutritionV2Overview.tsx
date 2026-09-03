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

function formatEnergy(data: NutritionDashboardData['todayEnergy']): string {
  if (data.amount !== null) return `${formatNumber(data.amount)} kcal`;
  if (data.low !== null && data.high !== null) {
    return `${formatNumber(data.low)}–${formatNumber(data.high)} kcal`;
  }
  return 'Sin total todavía';
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
            {macro.amount === null ? '—' : `${formatNumber(macro.amount, 1)} g`}
            {macro.coverage === 'partial' ? <small> conocidos</small> : null}
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
  return percentage(nutrient.amount, nutrient.target);
}

function NutrientRow({ nutrient }: { nutrient: NutritionNutrientValue }) {
  const progress = nutrientProgress(nutrient);
  const style = {
    '--nutrient-progress': `${Math.min(progress ?? 0, 100)}%`,
  } as CSSProperties;
  return (
    <div className={styles['nutrient-row']} data-has-value={nutrient.amount !== null}>
      <div className={styles['nutrient-copy']}>
        <strong>{nutrient.name}</strong>
        <span>
          {nutrient.amount === null
            ? 'Sin dato'
            : `${formatNumber(nutrient.amount, nutrient.amount < 10 ? 1 : 0)} ${nutrient.unit}`}
        </span>
      </div>
      <div className={styles['nutrient-progress']}>
        <div className={styles.track} aria-hidden="true">
          <span className={styles.fill} style={style} />
        </div>
        <small>
          {nutrient.target === null
            ? coverageLabel(nutrient.sourceCoverage)
            : `${progress ?? 0}% de ${formatNumber(nutrient.target, nutrient.target < 10 ? 1 : 0)} ${nutrient.unit}`}
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
  insight: NutritionAiInsight | undefined;
}) {
  return (
    <article className={styles.insight} data-tone={insight?.tone ?? 'neutral'}>
      <span className={styles['insight-icon']}>{icon}</span>
      <div>
        <small>{title}</small>
        <strong>{insight?.title ?? 'Todavía no calculado'}</strong>
        <p>
          {insight?.detail ??
            'Este bloque solo mostrará análisis que Nutrition Intelligence haya guardado en el store.'}
        </p>
        {insight?.evidence ? <span className={styles.evidence}>{insight.evidence}</span> : null}
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
  const energyProgress = percentage(data.todayEnergy.amount, targetEnergy);
  const remaining =
    data.todayEnergy.amount !== null && targetEnergy !== null
      ? Math.max(targetEnergy - data.todayEnergy.amount, 0)
      : null;
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
  const knownNutrients = data.nutrients.filter((nutrient) => nutrient.amount !== null);
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
              <span>Restante</span>
              <strong>{remaining === null ? '—' : `${formatNumber(remaining)} kcal`}</strong>
            </div>
            <div>
              <span>Calidad</span>
              <strong>{qualityLabel(data.todayEnergy.quality)}</strong>
            </div>
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
                const center = point.energyKcal;
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
                    <strong>{center === null ? '—' : formatNumber(center)}</strong>
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
                  {formatNumber(nutrient.amount, (nutrient.amount ?? 0) < 10 ? 1 : 0)}{' '}
                  {nutrient.unit}
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

      <section className={styles.panel} aria-labelledby="nutrition-ai-title">
        <div className={styles['section-heading']}>
          <div>
            <p className={styles.eyebrow}>ANÁLISIS IA</p>
            <h2 id="nutrition-ai-title">Calidad de la dieta y oportunidades</h2>
            <p>
              Vida no genera estas conclusiones: solo renderiza el análisis guardado por Nutrition
              Intelligence junto con su evidencia.
            </p>
          </div>
          <BrainCircuit size={21} aria-hidden="true" />
        </div>
        <div className={styles['insight-grid']}>
          <InsightCard
            icon={<Sparkles size={17} aria-hidden="true" />}
            title="Potencial antioxidante"
            insight={antioxidant}
          />
          <InsightCard
            icon={<Leaf size={17} aria-hidden="true" />}
            title="Perfil antiinflamatorio"
            insight={antiInflammatory}
          />
          <InsightCard
            icon={<Flame size={17} aria-hidden="true" />}
            title="Mejora de mayor impacto"
            insight={improvement}
          />
          {pattern ? (
            <InsightCard
              icon={<BrainCircuit size={17} aria-hidden="true" />}
              title="Patrón observado"
              insight={pattern}
            />
          ) : null}
        </div>
      </section>

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
                    {meal.energyKcal !== null
                      ? `${formatNumber(meal.energyKcal)} kcal`
                      : meal.energyKcalLow !== null && meal.energyKcalHigh !== null
                        ? `${formatNumber(meal.energyKcalLow)}–${formatNumber(meal.energyKcalHigh)}`
                        : '—'}
                  </strong>
                  <span data-confidence={meal.confidence}>{meal.confidence}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
