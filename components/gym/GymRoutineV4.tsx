'use client';

import {
  GYM_V4_DAY_SETS,
  GYM_V4_WEEKLY_SETS,
  type GymV4Day,
} from '@/lib/gym/routine-v4-proposal';

import styles from './GymDashboard.module.scss';

export function GymRoutineV4({ day, dayIndex }: { day: GymV4Day; dayIndex: number }) {
  return (
    <div className={styles.routine}>
      <section className={styles.supplemental} aria-label="Estado de la rutina V4">
        <div className={styles['supplemental-heading']}>
          <span>Propuesta de prueba · No es la rutina oficial</span>
          <h3>Rutina V4 — Estética prioritaria</h3>
        </div>
        <p className={styles.body}>
          3 días por semana · objetivo 70 min · máximo 75 min, incluyendo calentamiento,
          pesas, movilidad, estiramientos y transiciones.
        </p>
        <p className={styles.body}>
          Prioridades: espalda, deltoides laterales, bíceps, tríceps y glúteos.
        </p>
        <div className={styles.meta}>
          <span>{GYM_V4_WEEKLY_SETS} series semanales</span>
          <span>Prueba sugerida: 6–8 semanas</span>
        </div>
        <p className={styles.body}>
          La rutina fija sigue siendo el plan vigente de Notion. Esta alternativa no cambia
          tus sesiones registradas ni activa automáticamente un nuevo programa.
        </p>
      </section>

      <div className={styles['supplemental-heading']}>
        <span>{GYM_V4_DAY_SETS[dayIndex]} series · Objetivo 70–75 min</span>
        <h3>{day.label} — {day.focus}</h3>
      </div>

      <ol className={styles.exercises}>
        {day.exercises.map((exercise, index) => (
          <li key={`${day.id}-${index}`} className={styles.exercise}>
            <div className={styles['exercise-top']}>
              <span className={styles['exercise-name']}>{exercise.name}</span>
              <span className={styles.order}>{index + 1}</span>
            </div>
            <div className={styles.meta}>
              <span>{exercise.sets} × {exercise.reps} reps</span>
              <span>Descanso {exercise.rest}</span>
            </div>
            {exercise.note ? (
              <p className={styles['exercise-note']}>{exercise.note}</p>
            ) : null}
          </li>
        ))}
      </ol>

      <section className={styles.supplemental}>
        <div className={styles['supplemental-heading']}>
          <span>Organización de la sesión</span>
          <h3>Superseries</h3>
        </div>
        <ul className={styles['supplemental-items']}>
          {day.supersets.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p className={styles.body}>
          Alternar ejercicios y descansar 45–75 s después del par. Solo si resulta práctico
          con las máquinas disponibles; no acortar los descansos de compuestos a la fuerza.
        </p>
      </section>

      <details className={styles.disclosure}>
        <summary>Movilidad y estiramientos · 9–10 min al final</summary>
        <ul className={styles['supplemental-items']}>
          {day.mobility.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p className={styles.body}>
          Ajustar la selección a las limitaciones de movimiento que realmente notes.
        </p>
      </details>

      <details className={styles.disclosure}>
        <summary>Cómo manejar pesos, RIR y descansos</summary>
        <ul className={styles['supplemental-items']}>
          <li>
            Compuestos (jalón, remo, presses, prensa e hip thrust): primera serie pesada,
            dejando aproximadamente 1–2 repeticiones en reserva (RIR).
          </li>
          <li>
            Series siguientes: reducir aproximadamente 5–15% la carga solo si hace falta
            para mantener repeticiones de calidad. No bajar peso por obligación.
          </li>
          <li>
            Aislamientos: empezar con el mismo peso; revisar descanso, técnica y esfuerzo
            antes de bajarlo. Subir cuando consolides el rango alto.
          </li>
          <li>
            Regla general: 1–3 RIR en compuestos y 0–2 RIR en aislamientos;
            no hace falta llegar al fallo absoluto en cada serie.
          </li>
          <li>
            Calentamiento y aproximaciones: reservar 7–9 min. Los descansos de cada
            ejercicio están indicados en su ficha.
          </li>
        </ul>
      </details>

      <details className={styles.disclosure}>
        <summary>Recuperación, seguridad y límite de tiempo</summary>
        <ul className={styles['supplemental-items']}>
          <li>
            La duración es una estimación aún no verificada con cronómetro. Si se
            superan 75 min, ajustar primero accesorios menos prioritarios, sin apurar
            los ejercicios principales.
          </li>
          <li>
            Empezar esta prueba después de recuperar la fatiga acumulada y calibrar las
            variantes nuevas de forma progresiva.
          </li>
          <li>
            Si entrenás tres días consecutivos, no reducir volumen automáticamente:
            observar especialmente hip thrust A/B, femorales B/C y brazos B/C, y ajustar
            solo si cae el rendimiento o empeora la recuperación.
          </li>
          <li>
            No usar con carga exigente el press inclinado FOX si persiste la posible
            asimetría mecánica; pedir revisión o elegir otra máquina estable.
          </li>
        </ul>
      </details>
    </div>
  );
}
