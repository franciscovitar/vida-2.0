import type {
  NutritionNutrientReference,
  NutritionNutrientWindowRow,
} from '@/lib/nutrition/nutrient-window';
import type { NutritionNutrientWindowResult } from '@/lib/nutrition/nutrient-window-source';

import styles from './NutritionNutrientTrends.module.scss';

function formatNumber(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function confidenceLabel(value: NutritionNutrientWindowRow['confidence']): string {
  if (value === 'high') return 'alta';
  if (value === 'medium') return 'media';
  if (value === 'low') return 'baja';
  if (value === 'mixed') return 'mixta';
  return 'sin clasificar';
}

function referenceLabel(reference: NutritionNutrientReference | null, unit: string): string {
  if (!reference) return 'Sin referencia activa';
  const value = (amount: number) =>
    `${formatNumber(amount, amount < 10 ? 1 : 0)} ${unit}`;

  if (reference.semantics === 'adequacy') {
    const minimum = reference.target ?? reference.lowerTarget;
    if (minimum === null) return 'Referencia de adecuación';
    const upper =
      reference.upperTarget !== null ? ` · límite ≤ ${value(reference.upperTarget)}` : '';
    return `Referencia ≥ ${value(minimum)}${upper}`;
  }

  if (reference.semantics === 'upper-limit') {
    const limit = reference.upperTarget ?? reference.target;
    return limit === null ? 'Límite superior' : `Límite ≤ ${value(limit)}`;
  }

  if (reference.semantics === 'range') {
    if (reference.lowerTarget !== null && reference.upperTarget !== null) {
      return `Referencia ${value(reference.lowerTarget)}–${value(reference.upperTarget)}`;
    }
    return 'Rango de referencia';
  }

  if (reference.semantics === 'point' && reference.target !== null) {
    const upper =
      reference.upperTarget !== null ? ` · límite ≤ ${value(reference.upperTarget)}` : '';
    return `Objetivo ${value(reference.target)}${upper}`;
  }

  return 'Referencia registrada';
}

function attentionCopy(nutrient: NutritionNutrientWindowRow): string {
  const prefix = `${nutrient.attentionDays}/${nutrient.evaluatedDays} días comparables`;
  if (nutrient.attentionKind === 'below-reference') return `${prefix} por debajo de referencia`;
  if (nutrient.attentionKind === 'below-target') return `${prefix} por debajo del objetivo`;
  if (nutrient.attentionKind === 'above-limit') return `${prefix} por encima del límite`;
  if (nutrient.attentionKind === 'outside-range') return `${prefix} fuera del rango`;
  return `${prefix} fuera de la referencia aplicable`;
}

function averageLabel(nutrient: NutritionNutrientWindowRow): string {
  if (nutrient.averageAmount === null) return 'Sin promedio comparable';
  const digits = nutrient.averageAmount < 10 ? 1 : 0;
  return `${nutrient.averageApproximate ? '≈' : ''}${formatNumber(
    nutrient.averageAmount,
    digits,
  )} ${nutrient.unit}/día`;
}

export function NutritionNutrientTrends({
  data,
}: {
  data: NutritionNutrientWindowResult;
}) {
  const groups = [
    ['vitamin', 'Vitaminas'],
    ['mineral', 'Minerales'],
    ['other', 'Otros nutrientes'],
  ] as const;
  const withAverage = data.nutrients.filter((nutrient) => nutrient.averageAmount !== null).length;
  const sourceMessages: string[] = [];
  if (data.source.staleDateCount > 0) {
    sourceMessages.push(
      `Se omitieron ${data.source.staleDateCount} día(s) cuyo Nutrient Summary quedó detrás ` +
        'de evidencia más nueva.',
    );
  }
  if (data.source.unverifiableDateCount > 0) {
    sourceMessages.push(
      `No se pudieron validar ${data.source.unverifiableDateCount} día(s) por ` +
        'timestamps/evidencia incompletos.',
    );
  }
  if (data.source.integrityDowngradedDateCount > 0) {
    sourceMessages.push(
      `Se ajustó la cobertura de ${data.source.integrityDowngradedDateCount} día(s) ` +
        'tras auditar la lineage de Food Nutrients.',
    );
  }
  if (data.source.integritySuppressedSubtotalRowCount > 0) {
    sourceMessages.push(
      `Se ocultaron ${data.source.integritySuppressedSubtotalRowCount} subtotal(es) cuya ` +
        'lineage lower-level no pudo sostenerse.',
    );
  }
  if (data.source.integrityUnverifiableRowCount > 0) {
    sourceMessages.push(
      `${data.source.integrityUnverifiableRowCount} fila(s) quedaron como no verificables ` +
        'y no entran como evidencia comparable.',
    );
  }
  if (data.source.targetStatus !== 'ready') {
    sourceMessages.push(
      'Las referencias de objetivos no pudieron leerse completamente; no se inventan metas.',
    );
  }

  if (data.source.status === 'unavailable') {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>NUTRIENTES</p>
        <h2>No pudimos leer el resumen de nutrientes</h2>
        <p>
          La vista falla cerrada: no sustituye Nutrient Summary con ceros ni con datos simulados.
        </p>
      </section>
    );
  }

  return (
    <div className={styles.stack}>
      <section className={styles.summary} aria-labelledby="nutrient-window-title">
        <div>
          <p className={styles.eyebrow}>{data.windowDays} DÍAS</p>
          <h2 id="nutrient-window-title">Cobertura y patrones de nutrientes</h2>
          <p>
            Los promedios usan sólo días con cobertura completa. Los días parciales siguen contando
            como registro, pero no reducen artificialmente el promedio.
          </p>
        </div>
        <div className={styles.metrics}>
          <article>
            <span>Días con registro</span>
            <strong>{data.trackedDateCount}/{data.windowDays}</strong>
          </article>
          <article>
            <span>Con promedio comparable</span>
            <strong>{withAverage}</strong>
          </article>
          <article>
            <span>Señales persistentes</span>
            <strong>{data.attention.length}</strong>
          </article>
        </div>
        {sourceMessages.length > 0 ? (
          <p className={styles.notice}>{sourceMessages.join(' ')}</p>
        ) : null}
      </section>

      <section className={styles.panel} aria-labelledby="nutrient-attention-title">
        <div className={styles.heading}>
          <p className={styles.eyebrow}>QUÉ MERECE ATENCIÓN</p>
          <h2 id="nutrient-attention-title">Señales repetidas con evidencia suficiente</h2>
          <p>
            Una señal requiere al menos 3 días evaluables y repetición en al menos 2. No diagnostica
            una deficiencia ni toxicidad.
          </p>
        </div>

        {data.attention.length === 0 ? (
          <p className={styles.empty}>
            No hay una señal persistente con cobertura suficiente en este período.
          </p>
        ) : (
          <div className={styles.attention}>
            {data.attention.map((nutrient) => (
              <article key={nutrient.key}>
                <div>
                  <strong>{nutrient.name}</strong>
                  <span>{attentionCopy(nutrient)}</span>
                </div>
                <div className={styles.meta}>
                  <span>{averageLabel(nutrient)}</span>
                  <span>
                    cobertura completa {nutrient.completeDays}/{data.windowDays}
                  </span>
                  <span>confianza {confidenceLabel(nutrient.confidence)}</span>
                </div>
                <small>
                  {referenceLabel(nutrient.currentReference, nutrient.unit)}
                  {nutrient.targetDecisionCount > 1
                    ? ' · la referencia cambió durante el período'
                    : ''}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="all-nutrients-title">
        <div className={styles.heading}>
          <p className={styles.eyebrow}>TODOS LOS NUTRIENTES</p>
          <h2 id="all-nutrients-title">Promedio y cobertura del período</h2>
        </div>

        <div className={styles.groups}>
          {groups.map(([group, label]) => (
            <section key={group}>
              <h3>{label}</h3>
              <div className={styles.rows}>
                {data.nutrients
                  .filter((nutrient) => nutrient.group === group)
                  .map((nutrient) => (
                    <div className={styles.row} key={nutrient.key}>
                      <div>
                        <strong>{nutrient.name}</strong>
                        <span>{referenceLabel(nutrient.currentReference, nutrient.unit)}</span>
                      </div>
                      <div className={styles.value}>
                        <strong>{averageLabel(nutrient)}</strong>
                        <span>
                          {nutrient.completeDays}/{data.windowDays} completos
                          {nutrient.partialDays > 0 ? ` · ${nutrient.partialDays} parciales` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
