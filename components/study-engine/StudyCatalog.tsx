import { BookOpen, ChevronDown, CircleAlert, Layers3, Play } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { matchSubjectProgress } from '@/lib/study-engine/catalog';
import type { AssessmentProgressRead } from '@/types/assessment-progress';
import type { StudyCatalogRead, StudyCatalogSubject } from '@/types/study-catalog';

import styles from './StudyCatalog.module.scss';

function assessmentLabel(subject: StudyCatalogSubject): string {
  const id = subject.assessment?.id;
  if (!id) return 'Sin evaluación activa resuelta';

  const normalized = id.toLowerCase();
  const p = /-p(\d+)$/.exec(normalized);
  if (p) return `Parcial ${p[1]}`;

  const entrega = /entrega(\d+)$/.exec(normalized);
  if (entrega) return `Entrega ${entrega[1]}`;

  if (normalized.endsWith('-parcial')) return 'Parcial';
  return id;
}

function structureLabel(subject: StudyCatalogSubject): string {
  if (subject.structureStatus === 'resolved') return 'Estructura resuelta';
  if (subject.structureStatus === 'partial') return 'Estructura parcial';
  return 'Estructura pendiente';
}

function readinessLabel(value: string | null): string {
  const labels: Record<string, string> = {
    'not-ready': 'No listo',
    developing: 'En desarrollo',
    close: 'Cerca',
    'exam-ready': 'Listo para examen',
    unknown: 'Sin medir',
    unmeasured: 'Sin medir',
    'baseline-unmeasured': 'Baseline sin medir',
  };
  return value ? (labels[value] ?? value) : 'Sin medir';
}

export function StudyCatalog({
  catalog,
  assessmentProgress,
}: {
  catalog: StudyCatalogRead;
  assessmentProgress: AssessmentProgressRead;
}) {
  const subjects = catalog.subjects.map((subject) =>
    matchSubjectProgress(subject, assessmentProgress.snapshots),
  );

  return (
    <section className={styles.catalog} aria-labelledby="study-catalog-title">
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Facultad · 2026</p>
          <h2 id="study-catalog-title">Tus materias</h2>
          <p>
            Elegí una materia para ver su evaluación, temas y mazos. El progreso se muestra solo
            cuando existe evidencia canónica; “sin medir” no significa 0%.
          </p>
        </div>
        <span className={styles.count}>{subjects.length} activas</span>
      </div>

      {catalog.notice ? (
        <div className={styles.notice}>
          <CircleAlert size={16} aria-hidden="true" />
          <span>{catalog.notice}</span>
        </div>
      ) : null}

      <div className={styles.grid}>
        {subjects.map((subject) => {
          const progress = subject.progress;
          const progressPercent = progress?.payload.progressPercent ?? null;
          const readiness = progress?.payload.readinessBand ?? subject.readinessBand ?? 'unknown';

          return (
            <details key={subject.id} className={styles.card}>
              <summary>
                <div className={styles['subject-icon']}>
                  <BookOpen size={18} aria-hidden="true" />
                </div>
                <div className={styles['subject-main']}>
                  <div className={styles['subject-title-row']}>
                    <h3>{subject.name}</h3>
                    <span className={styles.term}>{subject.term ?? 'Actual'}</span>
                  </div>
                  <div className={styles.meta}>
                    <span>{assessmentLabel(subject)}</span>
                    <span>·</span>
                    <span>{structureLabel(subject)}</span>
                  </div>
                  <div className={styles['progress-row']}>
                    <span className={styles['progress-primary']}>
                      {progressPercent === null
                        ? 'Preparación sin medir'
                        : `Preparación ${progressPercent}%`}
                    </span>
                    <span>{readinessLabel(readiness)}</span>
                  </div>
                  {progressPercent !== null ? (
                    <div className={styles['progress-track']} aria-hidden="true">
                      <span style={{ width: `${progressPercent}%` }} />
                    </div>
                  ) : null}
                </div>
                <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
              </summary>

              <div className={styles.details}>
                {subject.currentUnit ? (
                  <p className={styles['current-unit']}>
                    <strong>Foco actual:</strong> {subject.currentUnit}
                  </p>
                ) : null}

                <div className={styles.stats}>
                  <span>
                    <Layers3 size={14} aria-hidden="true" />
                    {subject.topics.length > 0
                      ? `${subject.topics.length} tema(s)`
                      : 'Temas por resolver'}
                  </span>
                  <span>
                    {subject.conceptCount > 0
                      ? `${subject.conceptCount} conceptos/familias`
                      : 'Inventario todavía incompleto'}
                  </span>
                </div>

                {subject.topics.length > 0 ? (
                  <div className={styles.topics}>
                    {subject.topics.map((topic) => (
                      <div key={topic.id} className={styles.topic}>
                        <div className={styles['topic-head']}>
                          <strong>{topic.label}</strong>
                          {topic.conceptCount !== null ? (
                            <span>{topic.conceptCount} conceptos</span>
                          ) : null}
                        </div>
                        {topic.studySets.length > 0 ? (
                          <div className={styles.sets}>
                            {topic.studySets.map((set) => (
                              <span key={set.id}>{set.label}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.empty}>
                    Esta materia existe y está activa, pero el alcance todavía no está estructurado
                    con suficiente precisión en el Learning OS. No se muestra un 0% falso.
                  </p>
                )}

                {progress?.payload.nextBestActivity ? (
                  <p className={styles.next}>
                    <strong>Próximo recomendado:</strong> {progress.payload.nextBestActivity}
                  </p>
                ) : null}

                {subject.studyRuntimeAvailable ? (
                  <Button
                    href={`/aprendizaje/estudio/${subject.id}`}
                    variant="primary"
                    size="sm"
                    iconLeft={Play}
                  >
                    Empezar sesión
                  </Button>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
