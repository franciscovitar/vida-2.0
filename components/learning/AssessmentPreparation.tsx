import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';

import styles from './AssessmentPreparation.module.scss';

const CONFIDENCE = { low: 'baja', medium: 'media', high: 'alta' } as const;

/** The subject ChatGPT Project calculates. Vida only presents the received summary. */
export function AssessmentPreparation({
  snapshot,
  subjectName,
}: {
  snapshot: AssessmentProgressSnapshot | null;
  subjectName: string;
}) {
  const payload = snapshot?.payload;
  const canonical = payload?.progressPercent ?? null;
  const estimate = canonical === null ? payload?.preparationEstimate : null;
  const percent = canonical ?? estimate?.percent ?? null;
  if (percent === null || !snapshot || !payload) {
    return <p className={styles.unmeasured}>Preparación sin medir</p>;
  }

  const label = estimate ? 'Preparación estimada' : 'Preparación demostrada';
  const confidence = CONFIDENCE[estimate?.confidence ?? payload.progressConfidence];
  const date = estimate?.asOf ?? snapshot.generatedAt.slice(0, 10);
  const range =
    estimate && estimate.rangeLow !== null && estimate.rangeHigh !== null
      ? ` · Rango ${estimate.rangeLow}–${estimate.rangeHigh}%`
      : '';

  return (
    <div className={styles.preparation}>
      <strong>
        {label}: {percent}%
      </strong>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={`${label} · ${subjectName} · ${payload.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%${range} · Confianza ${confidence} · ${date}`}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p>
        Confianza {confidence} · <time dateTime={date}>{date}</time>
        {range}
      </p>
      {estimate ? <p>{estimate.basis} · Provisional; no mide la probabilidad de aprobar.</p> : null}
    </div>
  );
}
