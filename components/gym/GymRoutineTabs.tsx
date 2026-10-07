'use client';

import { useState } from 'react';

import type {
  GymRoutine,
  GymRoutineSectionKind,
  GymSession,
  GymSessionSummary,
} from '@/types/gym';

import styles from './GymDashboard.module.scss';

const SECTION_LABELS: Record<GymRoutineSectionKind, string> = {
  mobility: 'Movilidad',
  recovery: 'Recuperación',
  cardio: 'Cardio',
  planning: 'Planificación',
  notes: 'Complemento',
};

type DayKind = 'torso-a' | 'torso-b' | 'pierna';
type RoutineView = 'plan' | 'previous';
type MobilityItemKind = 'posture' | 'flexibility' | 'criteria' | 'other';

function dayKind(value: string | null | undefined): DayKind | null {
  if (!value) return null;
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[—–_]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (/torso[ -]*a/.test(normalized)) return 'torso-a';
  if (/torso[ -]*b/.test(normalized)) return 'torso-b';
  if (/pierna/.test(normalized)) return 'pierna';
  return null;
}

function formatLoad(load: string): string {
  const normalized = load.trim().replace(',', '.');
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? `${normalized} kg` : load.trim();
}

function formatSet(load: string | null, reps: number | null): string {
  const cleanLoad = load?.trim() ?? '';
  if (cleanLoad && reps !== null) return `${formatLoad(cleanLoad)} × ${reps}`;
  if (cleanLoad) return formatLoad(cleanLoad);
  if (reps !== null) return `${reps} reps`;
  return '—';
}

function latestComparableSession(input: {
  dayLabel: string;
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  today: string;
}): GymSession | null {
  const targetKind = dayKind(input.dayLabel);
  if (!targetKind) return null;

  const completed = new Set(
    input.summaries.filter((summary) => summary.completed === true).map((summary) => summary.key),
  );

  return (
    input.sessions
      .filter(
        (session) =>
          session.date <= input.today &&
          completed.has(session.key) &&
          dayKind(session.dayLabel) === targetKind,
      )
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}

function mobilityItem(item: string): { kind: MobilityItemKind; text: string } {
  const separator = item.indexOf(':');
  if (separator < 0) return { kind: 'other', text: item };

  const prefix = item.slice(0, separator).trim();
  const text = item.slice(separator + 1).trim();

  if (/^bloque\s+a\b/i.test(prefix)) return { kind: 'posture', text };
  if (/^bloque\s+b\b/i.test(prefix)) return { kind: 'flexibility', text };
  if (/^criterios?\b/i.test(prefix)) return { kind: 'criteria', text };
  return { kind: 'other', text: item };
}

function instructionParts(item: string): { title: string; detail: string | null } {
  const match = item.match(/^(.+?)\s+[—–]\s+(.+)$/);
  if (!match) return { title: item, detail: null };
  return { title: match[1]!.trim(), detail: match[2]!.trim() };
}

function mobilityDescription(value: string | null): {
  objective: string | null;
  schedule: string | null;
  detail: string | null;
} {
  if (!value) return { objective: null, schedule: null, detail: null };

  const marker = value.match(
    /(3\s+veces\s+por\s+semana\s*[—–-]\s*~?\s*16\/17\s+minutos?\s+despu[eé]s\s+del\s+gimnasio)\s*:\s*/i,
  );

  if (!marker || marker.index === undefined) {
    return { objective: value, schedule: null, detail: null };
  }

  return {
    objective: value.slice(0, marker.index).trim() || null,
    schedule: marker[1]!.trim(),
    detail: value.slice(marker.index + marker[0].length).trim() || null,
  };
}

function MobilityItems({ items }: { items: readonly string[] }) {
  return (
    <ol className={styles['supplemental-items']}>
      {items.map((item, index) => {
        const parts = instructionParts(item);
        return (
          <li key={`${index}-${item}`}>
            <strong>{parts.title}</strong>
            {parts.detail ? ` — ${parts.detail}` : null}
          </li>
        );
      })}
    </ol>
  );
}

export function GymRoutineTabs({
  routine,
  sessions,
  summaries,
  today,
}: {
  routine: GymRoutine;
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  today: string;
}) {
  const days = routine.days;
  const [active, setActive] = useState(0);
  const [view, setView] = useState<RoutineView>('plan');
  const day = days[Math.min(active, Math.max(days.length - 1, 0))] ?? null;
  const previousSession = day
    ? latestComparableSession({ dayLabel: day.label, sessions, summaries, today })
    : null;

  const mobilitySections = routine.supplementalSections.filter(
    (section) => section.kind === 'mobility' || section.kind === 'recovery',
  );
  const planningSections = routine.supplementalSections.filter(
    (section) => section.kind === 'planning',
  );
  const noteSections = routine.supplementalSections.filter(
    (section) => section.kind === 'notes' && !/^versi[oó]n$/i.test(section.label),
  );

  const guideGroups = [
    {
      key: 'mobility',
      title: 'Movilidad / postura',
      description: 'Tu bloque post-gym, separado en postura/control y flexibilidad específica.',
      sections: mobilitySections,
    },
    {
      key: 'planning',
      title: 'Progresión y descarga',
      description: 'Criterios para progresar y ajustar carga o volumen cuando haga falta.',
      sections: planningSections,
    },
    {
      key: 'notes',
      title: 'Notas complementarias',
      description: 'Información adicional del plan que no cambia la sesión principal.',
      sections: noteSections,
    },
  ].filter((group) => group.sections.length > 0);

  return (
    <div className={styles.routine}>
      {days.length > 0 ? (
        <>
          <div className={styles.tabs} role="tablist" aria-label="Días de rutina">
            {days.map((item, index) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={index === active}
                className={styles.tab}
                data-active={index === active ? 'true' : 'false'}
                onClick={() => setActive(index)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {day ? (
            <div className={styles.day} role="tabpanel">
              <div className={styles.tabs} role="tablist" aria-label="Vista de la rutina">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'plan'}
                  className={styles.tab}
                  data-active={view === 'plan' ? 'true' : 'false'}
                  onClick={() => setView('plan')}
                >
                  Rutina fija
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'previous'}
                  className={styles.tab}
                  data-active={view === 'previous' ? 'true' : 'false'}
                  onClick={() => setView('previous')}
                >
                  Última sesión
                </button>
              </div>

              {view === 'plan' ? (
                <>
                  <p className={styles.body}>
                    Esto es lo que está prescripto para este día. Las cargas que usaste la última vez
                    están separadas en “Última sesión”.
                  </p>

                  {day.notes.length > 0 ? (
                    <details className={styles.disclosure}>
                      <summary>Notas del día</summary>
                      <ul className={styles.notes}>
                        {day.notes.map((note, index) => (
                          <li key={`${index}-${note}`}>{note}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  <ol className={styles.exercises}>
                    {day.exercises.map((exercise) => (
                      <li key={exercise.key} className={styles.exercise}>
                        <div className={styles['exercise-top']}>
                          <span className={styles['exercise-name']}>{exercise.name}</span>
                          <span className={styles.order}>{exercise.order}</span>
                        </div>
                        <div className={styles.meta}>
                          {exercise.sets !== null ? <span>{exercise.sets} series</span> : null}
                          {exercise.reps ? <span>{exercise.reps}</span> : null}
                          {exercise.rest ? <span>Descanso {exercise.rest}</span> : null}
                          {exercise.targetRir ? <span>RIR {exercise.targetRir}</span> : null}
                          {exercise.targetRpe ? <span>RPE {exercise.targetRpe}</span> : null}
                        </div>
                        {!exercise.sets && !exercise.reps ? (
                          <p className={styles.raw}>{exercise.rawText}</p>
                        ) : null}
                        {exercise.notes ? (
                          <p className={styles['exercise-note']}>{exercise.notes}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </>
              ) : previousSession ? (
                <>
                  <div className={styles['previous-session']}>
                    <span>Última sesión comparable</span>
                    <strong>{previousSession.date}</strong>
                    <small>
                      Anterior: lo que hiciste realmente la última vez en este día, separado de la
                      prescripción fija.
                    </small>
                  </div>

                  <ol className={styles.exercises}>
                    {previousSession.exercises.map((exercise, index) => (
                      <li key={exercise.key} className={styles.exercise}>
                        <div className={styles['exercise-top']}>
                          <span className={styles['exercise-name']}>{exercise.exerciseName}</span>
                          <span className={styles.order}>{index + 1}</span>
                        </div>
                        <div className={styles['previous-performance']}>
                          <span>Series</span>
                          <div>
                            {exercise.sets.map((set) => (
                              <small key={set.key}>{formatSet(set.load, set.reps)}</small>
                            ))}
                          </div>
                        </div>
                        {exercise.note ? (
                          <p className={styles['exercise-note']}>{exercise.note}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className={styles.body}>Todavía no hay una sesión comparable registrada.</p>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.body}>Sin días estructurados en la rutina.</p>
      )}

      {guideGroups.length > 0 ? (
        <div className={styles['routine-guides']}>
          {guideGroups.map((group) => (
            <details key={group.key} className={styles['guide-disclosure']}>
              <summary>
                <span>
                  <strong>{group.title}</strong>
                  <small>{group.description}</small>
                </span>
                <span>Ver</span>
              </summary>

              {group.key === 'mobility' ? (
                <div className={styles['guide-content']}>
                  {group.sections.map((section) => {
                    const parsedDescription = mobilityDescription(section.description);
                    const parsedItems = section.items.map(mobilityItem);
                    const posture = parsedItems
                      .filter((item) => item.kind === 'posture')
                      .map((item) => item.text);
                    const flexibility = parsedItems
                      .filter((item) => item.kind === 'flexibility')
                      .map((item) => item.text);
                    const criteria = parsedItems
                      .filter((item) => item.kind === 'criteria')
                      .map((item) => item.text);
                    const other = parsedItems
                      .filter((item) => item.kind === 'other')
                      .map((item) => item.text);

                    return (
                      <section key={section.key} className={styles.supplemental}>
                        <div className={styles['supplemental-heading']}>
                          <span>EN EL GIMNASIO</span>
                          <h3>{parsedDescription.schedule ?? section.label}</h3>
                        </div>

                        {parsedDescription.objective ? (
                          <p className={styles.body}>
                            {parsedDescription.objective.replace(/^objetivo:\s*/i, '')}
                          </p>
                        ) : null}
                        {parsedDescription.detail ? (
                          <p className={styles.body}>{parsedDescription.detail}</p>
                        ) : null}

                        {posture.length > 0 ? (
                          <div className={styles.supplemental}>
                            <div className={styles['supplemental-heading']}>
                              <span>BLOQUE A · ~10 MIN</span>
                              <h3>Postura / control</h3>
                            </div>
                            <MobilityItems items={posture} />
                          </div>
                        ) : null}

                        {flexibility.length > 0 ? (
                          <div className={styles.supplemental}>
                            <div className={styles['supplemental-heading']}>
                              <span>BLOQUE B · ~6–7 MIN</span>
                              <h3>Flexibilidad específica</h3>
                            </div>
                            <MobilityItems items={flexibility} />
                          </div>
                        ) : null}

                        {other.length > 0 ? <MobilityItems items={other} /> : null}

                        {criteria.length > 0 ? (
                          <details className={styles.disclosure}>
                            <summary>Cómo usar este protocolo</summary>
                            <MobilityItems items={criteria} />
                          </details>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className={styles['guide-content']}>
                  {group.sections.map((section) => (
                    <section key={section.key} className={styles.supplemental}>
                      <div className={styles['supplemental-heading']}>
                        <span>{SECTION_LABELS[section.kind]}</span>
                        <h3>{section.label}</h3>
                      </div>
                      {section.description ? (
                        <p className={styles.body}>{section.description}</p>
                      ) : null}
                      {section.items.length > 0 ? (
                        <ol className={styles['supplemental-items']}>
                          {section.items.map((item, index) => (
                            <li key={`${index}-${item}`}>{item}</li>
                          ))}
                        </ol>
                      ) : null}
                    </section>
                  ))}
                </div>
              )}
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}
