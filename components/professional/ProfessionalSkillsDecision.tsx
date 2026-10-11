'use client';

import { useState } from 'react';

import type {
  ProfessionalSkillsData,
  SkillClaim,
  SkillRole,
} from '@/lib/professional/skills-contract';
import type {
  ForecastHorizon,
  ForecastOutlook,
  ProfessionalHorizonData,
} from '@/lib/professional/horizon-contract';

import styles from './ProfessionalSkillsDecision.module.scss';

const ROLE_NAMES: Record<string, string> = {
  'ai-native-product-engineer': 'Producto e ingeniería con IA',
  'full-stack-product-engineer': 'Full-Stack y producto',
  'software-engineer': 'Ingeniería de software',
  'systems-analyst-architect': 'Arquitectura y análisis de sistemas',
  'applied-ai-engineer': 'Ingeniería de IA aplicada',
  'data-analytics-engineer': 'Ingeniería de datos y analítica',
  'platform-production-engineer': 'Plataformas / DevOps / SRE',
  'security-engineer': 'Ingeniería de seguridad',
  'technical-founder-product-builder': 'Emprendimiento y producto tecnológico',
};

const SKILL_NAMES: Record<string, string> = {
  'production-deployment-cloud': 'Producción y despliegue',
  'distributed-systems-reliability': 'Confiabilidad de sistemas distribuidos',
  'testing-debugging-verification': 'Testing, diagnóstico y verificación',
  'sql-relational-data-modeling': 'SQL y modelado relacional',
  'postgresql-transactional-persistence': 'Persistencia y transacciones en PostgreSQL',
  'software-design-architecture': 'Arquitectura de software',
  'requirements-specification': 'Requisitos y especificación',
  'security-privacy-least-privilege': 'Seguridad y mínimo privilegio',
  'applied-llm-systems': 'Ingeniería de sistemas con LLM',
  'ai-native-orchestration': 'Orquestación de agentes con IA',
};

const HORIZONS: { key: ForecastHorizon; label: string }[] = [
  { key: 'NEAR_12_24M', label: '1–2 años' },
  { key: 'MID_3_5Y', label: '3–5 años' },
  { key: 'LONG_5_10Y', label: '5–10 años' },
];

const OUTLOOK: Record<ForecastOutlook, string> = {
  STRONG_POSITIVE: 'Señal muy favorable',
  POSITIVE: 'Favorable',
  POSITIVE_BUT_TRANSFORMING: 'Favorable, con cambios',
  MIXED: 'Señales mixtas',
  PRESSURE_ON_ROUTINE_TASKS: 'Presión sobre tareas',
  UNCERTAIN: 'Incierto',
};

const CONFIDENCE: Record<string, string> = {
  HIGH: 'alta',
  MEDIUM_HIGH: 'media-alta',
  MEDIUM: 'media',
  LOW: 'baja',
};

function EvidenceDetail({ claim, inRole }: { claim: SkillClaim; inRole: boolean }) {
  return (
    <li className={styles['skill-line']}>
      <span className={styles['role-mark']} data-matched={inRole} aria-hidden="true">
        {inRole ? '✓' : '—'}
      </span>
      <span>{SKILL_NAMES[claim.id] ?? claim.id}</span>
      <span className={styles['evidence-state']}>
        {claim.evidenceState === 'DEMONSTRATED' ? 'Demostrada en artefactos' : 'Practicada'}
      </span>
    </li>
  );
}

function RoleCoverage({ selectedRole, skills }: { selectedRole: SkillRole; skills: SkillClaim[] }) {
  const matches = skills.filter((skill) => selectedRole.coreSkillRefs.includes(skill.id));
  return (
    <div className={styles['role-coverage']}>
      <strong>
        {matches.length} de {skills.length} habilidades asociadas a esta capacidad figuran en el
        perfil elegido
      </strong>
      <ul className={styles['skills-list']}>
        {skills.map((claim) => (
          <EvidenceDetail
            key={claim.id}
            claim={claim}
            inRole={selectedRole.coreSkillRefs.includes(claim.id)}
          />
        ))}
      </ul>
    </div>
  );
}

export function ProfessionalSkillsDecision({
  skills,
  outlook,
}: {
  skills: ProfessionalSkillsData;
  outlook: ProfessionalHorizonData;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState('software-engineer');
  const [selectedAreaId, setSelectedAreaId] = useState('ai-native-product-software-engineering');
  const [selectedHorizon, setSelectedHorizon] = useState<ForecastHorizon>('NEAR_12_24M');

  if (skills.status !== 'ready' || !skills.snapshot) {
    return (
      <section className={styles.unavailable} aria-label="Comparador de habilidades">
        {skills.notice ?? 'Todavía no hay evidencia suficiente para comparar habilidades.'}
      </section>
    );
  }

  const snapshot = skills.snapshot;
  const selectedRole =
    snapshot.roles.find((role) => role.id === selectedRoleId) ?? snapshot.roles[0];
  const areas = outlook.snapshot?.profiles ?? [];
  const area = areas.find((entry) => entry.id === selectedAreaId) ?? areas[0];
  const phase = area?.horizons[selectedHorizon];

  return (
    <section className={styles.section} aria-labelledby="professional-skills-title">
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Tu mapa de capacidades · cinco frentes de aprendizaje</p>
        <h2 id="professional-skills-title">Qué aprender y qué podés demostrar</h2>
        <p>
          Compará habilidades necesarias para distintos perfiles con tu evidencia real. El sistema
          distingue proyectos demostrados de conocimiento verificado personalmente. No usa un
          puntaje único de carrera ni considera una habilidad «dominada» por haberla usado con IA.
        </p>
      </header>

      {skills.notice ? (
        <p className={styles.warning} role="status">
          {skills.notice}
        </p>
      ) : null}

      <div className={styles['field-row']}>
        <div className={styles.field}>
          <label htmlFor="skills-target-role">Perfil profesional de referencia</label>
          <select
            id="skills-target-role"
            value={selectedRole.id}
            onChange={(event) => setSelectedRoleId(event.target.value)}
          >
            {snapshot.roles.map((role) => (
              <option value={role.id} key={role.id}>
                {ROLE_NAMES[role.id] ?? role.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className={styles['reading-guide']}>
        La marca ✓ indica que la habilidad figura entre los requisitos principales de ese perfil en
        la ontología PAS. No significa que esté pedida en todas las vacantes. «Demostrada» significa
        evidencia de proyectos;{' '}
        <strong>ninguna habilidad de esta matriz tiene aún verificación personal directa</strong>.
      </p>

      <div className={styles.cards}>
        {snapshot.items.map((item) => {
          const count = item.skillRefs.filter((skill) =>
            selectedRole.coreSkillRefs.includes(skill.id),
          ).length;
          return (
            <article className={styles.card} key={item.id}>
              <div className={styles['card-title']}>
                <h3>{item.title}</h3>
                <span className={styles['queue-status']}>
                  {item.queueState === 'PRACTICING' ? 'En práctica' : 'Para trabajar'}
                </span>
              </div>
              <div className={styles['card-grid']}>
                <div>
                  <p className={styles.kicker}>Vínculo con el perfil seleccionado</p>
                  <RoleCoverage selectedRole={selectedRole} skills={item.skillRefs} />
                  <p className={styles['context-note']}>
                    {count === 0
                      ? 'Esta capacidad no tiene correspondencia directa en los requisitos principales de este perfil; puede seguir siendo transversal.'
                      : 'Correspondencia por referencias de habilidades, no por cantidad de ofertas laborales.'}
                  </p>
                </div>
                <div>
                  <p className={styles.kicker}>Acción y evidencia</p>
                  <p>Esta capacidad se trabaja en la cola de crecimiento, más abajo.</p>
                  <details>
                    <summary>Ver motivo, práctica y evidencia requerida</summary>
                    <p className={styles['why-now']}>{item.whyNow}</p>
                    <div className={styles['practice-block']}>
                      <strong>Práctica</strong>
                      <p>{item.practiceContract}</p>
                    </div>
                    <p>{item.evidenceTarget}</p>
                  </details>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className={styles['time-section']}>
        <div className={styles['time-heading']}>
          <p className={styles.eyebrow}>Perspectiva temporal · contexto profesional</p>
          <h3>Cómo adaptar el aprendizaje al futuro</h3>
          <p>
            La cola anterior explica lo que conviene practicar <strong>hoy</strong>. Todavía no hay
            series comparables que permitan pronosticar la demanda de cada skill a 3–5 o 5–10 años.
            Para esos plazos mostramos por separado el pronóstico de un
            <strong> área profesional</strong>, no una supuesta demanda de SQL, seguridad o IA.
          </p>
        </div>

        {outlook.status === 'ready' && area && phase ? (
          <div className={styles['time-card']}>
            {outlook.notice ? <p className={styles.warning}>{outlook.notice}</p> : null}
            <div className={styles['field-row']}>
              <div className={styles.field}>
                <label htmlFor="skills-area">Área de referencia (independiente del perfil)</label>
                <select
                  id="skills-area"
                  value={area.id}
                  onChange={(event) => setSelectedAreaId(event.target.value)}
                >
                  {areas.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className={styles['horizon-field']}>
                <legend>Horizonte del sector</legend>
                <div className={styles['horizon-options']}>
                  {HORIZONS.map((entry) => (
                    <button
                      type="button"
                      key={entry.key}
                      aria-pressed={selectedHorizon === entry.key}
                      onClick={() => setSelectedHorizon(entry.key)}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className={styles['sector-detail']} aria-live="polite">
              <h4>
                {OUTLOOK[phase.outlook]} · confianza {CONFIDENCE[phase.confidence]}
              </h4>
              <p>{phase.aiInteractionEs}</p>
            </div>
          </div>
        ) : (
          <p className={styles.unavailable}>
            Pronósticos por sector no disponibles: no extrapolamos demanda de habilidades.
          </p>
        )}
        <p className={styles['context-note']}>
          El perfil seleccionado y el área de pronóstico se eligen por separado; no existe una
          equivalencia exacta entre ambas taxonomías.{' '}
          <a href="/professional/mercado">Ver las fuentes y comparaciones de Mercado →</a>
        </p>
      </div>

      <footer className={styles.footer}>
        <strong>Fuente:</strong> PAS, crecimiento observado {snapshot.source.observedAt}, evidencia
        personal {snapshot.source.personalEvidenceObservedAt}. Ontología de nueve roles. Recuento de
        coincidencias de requisitos, no vacantes, tasas de contratación ni dominio. Las frecuencias
        y tendencias de demanda por habilidad permanecen sin evidencia comparable. Derivado PAS{' '}
        <code>{snapshot.source.commit.slice(0, 8)}</code>.
      </footer>
    </section>
  );
}
