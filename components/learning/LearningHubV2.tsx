import { Brain, Layers3, MessageCircle, Sparkles } from 'lucide-react';

import { StudyCatalog } from '@/components/study-engine/StudyCatalog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { AssessmentProgressRead } from '@/types/assessment-progress';
import type { StudyCatalogRead } from '@/types/study-catalog';

import styles from './LearningHubV2.module.scss';

export function LearningHubV2({
  catalog,
  assessmentProgress,
}: {
  catalog: StudyCatalogRead;
  assessmentProgress: AssessmentProgressRead;
}) {
  return (
    <div className={styles.stack}>
      <section className={styles.hero} aria-labelledby="learning-now-title">
        <div>
          <p className={styles.eyebrow}>Facultad primero</p>
          <h2 id="learning-now-title">Qué aprender ahora</h2>
          <p>
            El hub prioriza evaluaciones, gaps y evidencia real. Horas, Anki y bancos familiares
            ayudan a practicar, pero no se convierten solos en dominio.
          </p>
        </div>
        <Button href="/aprendizaje/estudio" variant="primary" size="sm" iconLeft={Brain}>
          Abrir modo estudio
        </Button>
      </section>

      <StudyCatalog catalog={catalog} assessmentProgress={assessmentProgress} />

      <div className={styles.grid}>
        <Card>
          <SectionHeader
            title="Estudio adaptativo"
            description="Práctica y recuperación según evaluación, evidencia y gaps."
            icon={Layers3}
            domain="learning"
          />
          <div className={styles['card-body']}>
            <p>
              Modo estudio reúne sesiones por materia, práctica fresca y los sets disponibles.
              Atomic Study y Anki siguen siendo herramientas de práctica, no un score de mastery.
            </p>
            <Button href="/aprendizaje/estudio" variant="secondary" size="sm" iconLeft={Brain}>
              Ver materias y sets
            </Button>
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="English Speaking"
            description="Evidencia oral y mantenimiento del mazo adaptativo."
            icon={MessageCircle}
            domain="learning"
          />
          <div className={styles['card-body']}>
            <p>
              El speaking conserva su sistema propio: errores observados, uso espontáneo y
              transferencia pesan más que repetir tarjetas conocidas.
            </p>
            <Button href="/aprendizaje/ingles" variant="secondary" size="sm" iconLeft={MessageCircle}>
              Abrir English Speaking
            </Button>
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Explorar capacidades"
            description="Biblioteca generalista, no una lista de pendientes."
            icon={Sparkles}
            domain="neutral"
          />
          <div className={styles['card-body']}>
            <p>
              Esta capa permanece deliberadamente liviana mientras Facultad tenga prioridad. No
              existe “aprendido / 245” ni deuda por lo que todavía no exploraste.
            </p>
            <div className={styles.dormant}>
              <strong>Disponible cuando quieras activarla</strong>
              <span>
                La selección futura mostrará pocos candidatos relevantes, con beneficios,
                esfuerzo, mantenimiento y complementariedad visibles.
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
