import { CalendarDays, CircleDot, Compass, HeartPulse, History } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  dailyOrientationV2ReadNotice,
  isDailyOrientationV2ReadFailure,
} from '@/lib/daily-planning/orientation-rollout';
import type { DailyOrientationView } from '@/types/daily-orientation-v2';

import styles from './DailyOrientationPanels.module.scss';

function shortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}` : value;
}

export function DailyRealityReviewPanel({ orientation }: { orientation: DailyOrientationView }) {
  const review = orientation.review;
  const readFailed = isDailyOrientationV2ReadFailure(orientation.readStatus);
  const notice = dailyOrientationV2ReadNotice(orientation);

  return (
    <Card>
      <SectionHeader
        title="Revisión"
        description="Qué pasó realmente ayer, qué cambió y qué sigue incierto."
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
              ? 'No se pudo verificar la revisión V2.'
              : 'Todavía no hay una revisión V2 persistida.'}
          </strong>
          <p>
            {readFailed
              ? 'Podés continuar la revisión en el chat. Esta vista no reconstruye lo ocurrido desde suposiciones.'
              : 'El análisis se hace en tu proyecto ChatGPT de Planificación. Todavía no hay un resultado guardado para mostrar acá; no se inventa un resumen de ayer.'}
          </p>
        </div>
      ) : (
        <div className={styles.stack}>
          <div className={styles.headline}>
            <span>{shortDate(review.date)}</span>
            <strong>{review.headline}</strong>
          </div>

          {review.items.length > 0 ? (
            <ul className={styles.items}>
              {review.items.map((item, index) => (
                <li key={`${item.domain}-${item.activity}-${index}`}>
                  <div className={styles['item-top']}>
                    <strong>{item.activity}</strong>
                    <span>{item.evidenceState}</span>
                  </div>
                  <p>{item.summary}</p>
                  <small>
                    {item.progressEffect === 'verified'
                      ? 'Avance verificado'
                      : item.progressEffect === 'none'
                        ? 'Actividad sin avance objetivo atribuido'
                        : `Efecto en progreso: ${item.progressEffect}`}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Sin cambios relevantes persistidos para el día revisado.</p>
          )}

          {orientation.lifeSignals.length > 0 ? (
            <section>
              <p className={styles.label}>Vida / recuperación</p>
              <ul className={styles.signals}>
                {orientation.lifeSignals.map((signal, index) => (
                  <li key={`${signal.kind}-${index}`}>
                    <HeartPulse size={14} aria-hidden="true" />
                    <span>
                      <strong>{signal.summary}</strong>
                      <small>
                        {signal.level} · confianza {signal.confidence}
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
          title="Atención"
          description="Pocas señales explicables; no un ranking opaco ni una agenda completa."
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
                ? 'No se pudo verificar la atención V2.'
                : filtered
                  ? 'No hay prioridades verificables con las fuentes actuales.'
                  : orientation.review
                    ? 'No hay un ajuste importante persistido para hoy.'
                    : 'Todavía no hay prioridades guardadas desde ChatGPT.'}
            </strong>
            <p>No se fabrica una prioridad sólo para llenar la pantalla.</p>
          </div>
        ) : (
          <ol className={styles.attention}>
            {orientation.attention.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                <div className={styles['attention-index']}>{index + 1}</div>
                <div>
                  <div className={styles['item-top']}>
                    <strong>{item.title}</strong>
                    <span>{item.confidence}</span>
                  </div>
                  <p>{item.recommendation}</p>
                  <small>{item.why}</small>
                  {item.nextAction ? <b>Próximo: {item.nextAction}</b> : null}
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
              title="Versión mínima"
              description="Qué preservar si baja la capacidad."
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
              description="Trabajo que puede esperar para proteger foco o recuperación."
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
  return (
    <Card>
      <SectionHeader
        title="Próximas fechas"
        description="Compromisos seleccionados cuando ChatGPT generó el análisis, no un calendario en vivo."
        icon={CalendarDays}
        domain="productivity"
      />
      {orientation.upcoming.length === 0 ? (
        <div className={styles.empty}>
          <strong>Sin fechas confirmadas en el último análisis guardado.</strong>
          <p>Esto no significa que tengas el calendario libre. Consultá las fuentes actuales en ChatGPT antes de decidir.</p>
        </div>
      ) : (
        <ul className={styles.items}>
          {orientation.upcoming.slice(0, 5).map((item, index) => (
            <li key={`${item.kind}-${item.title}-${index}`}>
              <div className={styles['item-top']}>
                <strong>{item.title}</strong>
                <span>{shortDate(item.date)}</span>
              </div>
              <p>{item.reason}</p>
              <small>{item.dateType === 'unknown' ? 'Tipo de fecha no confirmado' : item.dateType}</small>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
