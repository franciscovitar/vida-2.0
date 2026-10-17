import { CalendarDays, CircleDot, Compass, HeartPulse, History } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  dailyOrientationV2ReadNotice,
  isDailyOrientationV2ReadFailure,
} from '@/lib/daily-planning/orientation-rollout';
import type { DailyOrientationView } from '@/types/daily-orientation-v2';

import {
  dateTypeLabel,
  evidenceStateLabel,
  lifeSignalLevelLabel,
  progressEffectLabel,
} from './daily-orientation-labels';

import styles from './DailyOrientationPanels.module.scss';

function dateLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

export function DailyRealityReviewPanel({ orientation }: { orientation: DailyOrientationView }) {
  const review = orientation.review;
  const readFailed = isDailyOrientationV2ReadFailure(orientation.readStatus);
  const notice = dailyOrientationV2ReadNotice(orientation);

  return (
    <Card>
      <SectionHeader
        title="Balance de ayer"
        description="Lo que pasó ayer, el avance observado y lo que aún no se sabe."
        icon={History}
        domain="productivity"
      />

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      {!review ? (
        <div className={styles.empty}>
          <strong>
            {readFailed
              ? 'No se pudo verificar la revisión.'
              : 'Todavía no hay una revisión guardada.'}
          </strong>
          <p>
            {readFailed
              ? 'Podés continuarla en el chat. Esta vista no completa lo ocurrido con suposiciones.'
              : 'Hacé la revisión en tu proyecto ChatGPT de Planificación. Vida muestra el resumen cuando queda guardado; no inventa qué pasó ayer.'}
          </p>
        </div>
      ) : (
        <div className={styles.stack}>
          <div className={styles.headline}>
            <time dateTime={review.date}>{dateLabel(review.date)}</time>
            <strong>{review.headline}</strong>
          </div>

          {review.items.length > 0 ? (
            <ul className={styles.items}>
              {review.items.map((item, index) => (
                <li key={`${item.domain}-${item.activity}-${index}`}>
                  <div className={styles['item-top']}>
                    <strong>{item.activity}</strong>
                    <span className={styles.badge}>{evidenceStateLabel(item.evidenceState)}</span>
                  </div>
                  <p>{item.summary}</p>
                  <span className={styles['progress-label']}>
                    {progressEffectLabel(item.progressEffect)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Sin cambios relevantes persistidos para el día revisado.</p>
          )}

          {orientation.lifeSignals.length > 0 ? (
            <section>
              <p className={styles.label}>Bienestar y recuperación</p>
              <ul className={styles.signals}>
                {orientation.lifeSignals.map((signal, index) => (
                  <li key={`${signal.kind}-${index}`}>
                    <HeartPulse size={18} aria-hidden="true" />
                    <span className={styles['signal-copy']}>
                      <strong>{signal.summary}</strong>
                      <small>
                        {lifeSignalLevelLabel(signal.level)} · confianza{' '}
                        {signal.confidence.toLowerCase()}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {review.uncertainties.length > 0 ? (
            <section>
              <p className={styles.label}>Incertidumbres</p>
              <ul className={styles.uncertainties}>
                {review.uncertainties.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Card>
  );
}

export function DailyAttentionPanel({ orientation }: { orientation: DailyOrientationView }) {
  const readFailed = isDailyOrientationV2ReadFailure(orientation.readStatus);
  const notice = dailyOrientationV2ReadNotice(orientation);
  const filtered = orientation.quality.unresolvedRefs > 0 || orientation.quality.dateConflicts > 0;
  return (
    <div className={styles.stack}>
      <Card>
        <SectionHeader
          title="Prioridades de hoy"
          description="Hasta tres prioridades, cada una con su motivo y próximo paso."
          icon={Compass}
          domain="productivity"
        />

        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}

        {orientation.attention.length === 0 ? (
          <div className={styles.empty}>
            <strong>
              {readFailed
                ? 'No se pudo verificar la atención.'
                : filtered
                  ? 'No hay prioridades verificables con las fuentes actuales.'
                  : orientation.review
                    ? 'No hay un ajuste importante para hoy.'
                    : 'Todavía no hay prioridades guardadas desde ChatGPT.'}
            </strong>
            <p>No agregamos prioridades solo para completar la lista.</p>
          </div>
        ) : (
          <ol className={styles.attention}>
            {orientation.attention.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                <div className={styles['attention-index']}>{index + 1}</div>
                <div>
                  <div className={styles['item-top']}>
                    <strong>{item.title}</strong>
                    <span className={styles.badge}>Confianza {item.confidence.toLowerCase()}</span>
                  </div>
                  <p>{item.recommendation}</p>
                  <p className={styles.why}>{item.why}</p>
                  {item.nextAction ? (
                    <div className={styles.next}>
                      <span>Próximo paso</span>
                      <strong>{item.nextAction}</strong>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {orientation.minimum.length > 0 || orientation.notNow.length > 0 ? (
        <div className={styles.grid}>
          <Card>
            <SectionHeader
              title="Mínimo viable"
              description="Lo esencial si hoy tenés menos tiempo o energía."
              icon={CircleDot}
              domain="productivity"
            />
            <ul className={styles.compact}>
              {orientation.minimum.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <strong>{item.title}</strong>
                  <span>{item.why}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <SectionHeader
              title="No movería hoy"
              description="Lo que puede esperar para cuidar tu foco o descanso."
              icon={CircleDot}
              domain="neutral"
            />
            <ul className={styles.compact}>
              {orientation.notNow.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <strong>{item.title}</strong>
                  <span>{item.why}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

/** Upcoming commitments belong to the saved conversational snapshot.
 * Vida displays their verified-at-analysis claims; it does not query Google
 * Calendar or infer a free day from an empty list. */
export function DailyUpcomingPanel({ orientation }: { orientation: DailyOrientationView }) {
  const readFailed = isDailyOrientationV2ReadFailure(orientation.readStatus);
  return (
    <Card>
      <SectionHeader
        title="Próximas fechas"
        description="Fechas incluidas en el último análisis; no se actualizan en vivo."
        icon={CalendarDays}
        domain="productivity"
      />
      {orientation.upcoming.length === 0 ? (
        <div className={styles.empty}>
          <strong>
            {readFailed
              ? 'No se pudieron verificar las próximas fechas.'
              : 'No hay próximas fechas confirmadas en este análisis.'}
          </strong>
          <p>
            Esto no confirma que estés libre. Revisá tus fuentes actuales en ChatGPT antes de
            decidir.
          </p>
        </div>
      ) : (
        <ul className={styles.upcoming}>
          {orientation.upcoming.slice(0, 5).map((item, index) => (
            <li key={`${item.kind}-${item.title}-${index}`}>
              <div className={styles['upcoming-main']}>
                <strong>{item.title}</strong>
                <time dateTime={item.date}>{dateLabel(item.date)}</time>
              </div>
              <p>{item.reason}</p>
              <span className={styles['date-type']}>{dateTypeLabel(item.dateType)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
