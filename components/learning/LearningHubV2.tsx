import {
  ArrowRight,
  BookOpen,
  Brain,
  CircleAlert,
  LibraryBig,
  MessageCircle,
  Play,
} from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { matchSubjectProgress } from '@/lib/study-engine/catalog';
import type { AssessmentProgressRead } from '@/types/assessment-progress';
import type { StudyCatalogRead, StudySubjectWithProgress } from '@/types/study-catalog';

import styles from './LearningHubV2.module.scss';

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

function assessmentLabel(subject: StudySubjectWithProgress): string {
  const assessment = subject.assessment;
  if (!assessment) return 'Sin evaluación activa resuelta';

  const id = assessment.id.toLowerCase();
  const parcial = /-p(\d+)$/.exec(id);
  if (parcial) return `Parcial ${parcial[1]}`;

  const entrega = /entrega(\d+)$/.exec(id);
  if (entrega) return `Entrega ${entrega[1]}`;

  if (id.endsWith('-parcial')) return 'Parcial';
  return assessment.id;
}

function subjectSortValue(subject: StudySubjectWithProgress): string {
  return subject.assessment?.date ?? '9999-12-31';
}

export function LearningHubV2({
  catalog,
  assessmentProgress,
}: {
  catalog: StudyCatalogRead;
  assessmentProgress: AssessmentProgressRead;
}) {
  const subjects = catalog.subjects
    .map((subject) => matchSubjectProgress(subject, assessmentProgress.snapshots))
    .sort((left, right) => {
      const byDate = subjectSortValue(left).localeCompare(subjectSortValue(right));
      return byDate || left.name.localeCompare(right.name, 'es');
    });

  return (
    <div className={styles.stack}>
      {catalog.notice ? (
        <div className={styles.notice} role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{catalog.notice}</span>
        </div>
      ) : null}

      <Card>
        <SectionHeader
          title="Facultad ahora"
          description="Estado real de tus materias activas. Sin medir no significa 0%."
          icon={Brain}
          domain="learning"
          action={
            <Link href="/aprendizaje/estudio" className={styles.link}>
              Abrir modo estudio
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          }
        />

        {subjects.length === 0 ? (
          <p className={styles.empty}>
            No hay materias activas verificables en el catálogo canónico.
          </p>
        ) : (
          <div className={styles.subjects}>
            {subjects.map((subject) => {
              const progress = subject.progress;
              const progressPercent = progress?.payload.progressPercent ?? null;
              const readiness =
                progress?.payload.readinessBand ?? subject.readinessBand ?? 'unknown';
              const next = progress?.payload.nextBestActivity ?? null;
              const setCount = subject.topics.reduce(
                (total, topic) => total + topic.studySets.length,
                0,
              );

              return (
                <article key={subject.id} className={styles.subject}>
                  <div className={styles['subject-top']}>
                    <div>
                      <span className={styles.kicker}>{assessmentLabel(subject)}</span>
                      <h3>{subject.name}</h3>
                    </div>
                    <span className={styles.readiness}>{readinessLabel(readiness)}</span>
                  </div>

                  <div className={styles.meta}>
                    <span>{subject.assessment?.date ?? 'Fecha sin confirmar'}</span>
                    <span>
                      {progressPercent === null
                        ? 'Preparación sin medir'
                        : `Preparación ${progressPercent}%`}
                    </span>
                    <span>
                      {setCount > 0 ? `${setCount} set(s) de estudio` : 'Sets por resolver'}
                    </span>
                  </div>

                  {progressPercent !== null ? (
                    <div className={styles.track} aria-hidden="true">
                      <span style={{ width: `${progressPercent}%` }} />
                    </div>
                  ) : null}

                  {subject.currentUnit ? (
                    <p className={styles.current}>
                      <strong>Foco:</strong> {subject.currentUnit}
                    </p>
                  ) : null}

                  {next ? (
                    <p className={styles.next}>
                      <strong>Próximo recomendado:</strong> {next}
                    </p>
                  ) : null}

                  <div className={styles['subject-actions']}>
                    {subject.studyRuntimeAvailable ? (
                      <Link href={`/aprendizaje/estudio/${subject.id}`}>
                        <Play size={13} aria-hidden="true" />
                        Estudiar
                      </Link>
                    ) : (
                      <Link href="/aprendizaje/estudio">
                        <BookOpen size={13} aria-hidden="true" />
                        Ver detalle
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <div className={styles.grid}>
        <Card>
          <SectionHeader
            title="English Speaking"
            description="Práctica oral y evidencia de uso real; sin convertir cantidad de práctica en dominio."
            icon={MessageCircle}
            domain="learning"
          />
          <div className={styles.feature}>
            <p>
              Mantené separado el progreso oral de Facultad. La evidencia fuerte sigue siendo el uso
              espontáneo correcto y la transferencia a contextos nuevos.
            </p>
            <Link href="/aprendizaje/ingles" className={styles.featureLink}>
              Abrir English Speaking
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Explorar capacidades"
            description="Biblioteca generalista, no backlog."
            icon={LibraryBig}
            domain="learning"
          />
          <div className={styles.feature}>
            <p>
              La biblioteca generalista está capturada en el PAS, pero permanece en pausa mientras
              Universidad sea la prioridad. No hay porcentaje por completar ni deuda por lo que no
              aprendas ahora.
            </p>
            <div className={styles.dormant}>
              <span>Estado</span>
              <strong>En pausa · disponible cuando decidas activarla</strong>
            </div>
          </div>
        </Card>
      </div>

      <Card compact>
        <div className={styles.footer}>
          <Brain size={15} aria-hidden="true" />
          <p>
            Aprendizaje muestra evidencia y próximos pasos. La enseñanza y práctica profunda siguen
            ocurriendo dentro del proyecto de cada materia.
          </p>
        </div>
      </Card>
    </div>
  );
}
