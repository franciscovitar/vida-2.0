'use client';

import { useState } from 'react';

import type {
  CareerResilienceData,
  CareerResilienceHorizon,
  CareerResilienceHorizonKey,
} from '@/types/career-resilience';

import { resilienceSpanishLists } from '@/lib/professional/resilience-copy-es';

import { ProfessionalResilienceTimeline } from './ProfessionalResilienceTimeline';

import styles from './ProfessionalResilienceComparison.module.scss';

const HORIZONS: { key: CareerResilienceHorizonKey; label: string }[] = [
  { key: 'Y1', label: '1 año' },
  { key: 'Y5', label: '5 años' },
  { key: 'Y10', label: '10 años' },
  { key: 'Y20', label: '20 años' },
];

const ROLE_NAMES: Record<string, string> = {
  'ai-native-product-engineer': 'Producto e ingeniería con IA',
  'full-stack-product-engineer': 'Full-Stack / producto',
  'software-engineer': 'Ingeniería de software',
  'systems-analyst-architect': 'Arquitectura y análisis de sistemas',
  'applied-ai-engineer': 'Ingeniería de IA aplicada',
  'data-engineer': 'Ingeniería de datos',
  'data-scientist': 'Ciencia de datos',
  'data-analyst-bi': 'Análisis de datos / BI',
  'platform-production-engineer': 'Plataformas / DevOps / SRE',
  'security-engineer': 'Ingeniería de seguridad / AppSec',
  'technical-founder-product-builder': 'Emprendimiento y producto tecnológico',
};

const ROLE_ADAPTATION: Record<string, string> = {
  'ai-native-product-engineer':
    'Profundizá en orquestación de agentes, evaluación y verificación, no solamente en escribir instrucciones.',
  'full-stack-product-engineer':
    'Desarrollá criterio y evidencia sobre el producto y sus sistemas, más allá de completar tickets.',
  'software-engineer':
    'Priorizá arquitectura, depuración, integración y responsabilidad por resultados, no volumen de código.',
  'systems-analyst-architect':
    'Trabajá en calidad de requisitos y decisiones, no solamente en producir diagramas.',
  'applied-ai-engineer':
    'Demostrá evaluaciones, observabilidad, recuperación fiable de información y seguridad.',
  'data-engineer': 'Profundizá modelado, transacciones, calidad, linaje y gobierno de datos.',
  'data-scientist':
    'Priorizá estadística, causalidad, experimentos e interpretación frente a mecánica de notebooks.',
  'data-analyst-bi':
    'Evolucioná de generar tableros hacia definir métricas y resolver preguntas de negocio ambiguas.',
  'platform-production-engineer':
    'Demostrá observabilidad, respuesta a incidentes, recuperación y razonamiento sobre fallos.',
  'security-engineer':
    'Pasá de operar herramientas a modelado de amenazas, AppSec y arquitectura segura.',
  'technical-founder-product-builder':
    'Sumá descubrimiento de clientes, distribución y decisiones de negocio a la ejecución técnica.',
};

const CONFIDENCE: Record<string, string> = {
  HIGH: 'Alta',
  MEDIUM_HIGH: 'Media-alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

const NUMBER = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

type RangeMetric = {
  key: 'pressure' | 'resilience' | 'compression';
  title: string;
  range: readonly [number, number];
  suffix: string;
  unit: string;
  explanation: string;
};

function RangeBand({ metric }: { metric: RangeMetric }) {
  const [low, high] = metric.range;
  return (
    <article className={styles.metric}>
      <div className={styles['metric-head']}>
        <h4>{metric.title}</h4>
        <strong className={styles.value}>
          {NUMBER.format(low)}–{NUMBER.format(high)}
          {metric.suffix}
        </strong>
      </div>
      <div className={styles['range-track']} aria-hidden="true">
        <div
          className={styles['range-band']}
          data-kind={metric.key}
          style={{ left: String(low) + '%', width: String(high - low) + '%' }}
        />
      </div>
      <div className={styles.scale} aria-hidden="true">
        <span>0</span>
        <span>100</span>
      </div>
      <p className={styles['metric-detail']}>{metric.explanation}</p>
      <p className={styles.unit}>{metric.unit}</p>
    </article>
  );
}

function metrics(horizon: CareerResilienceHorizon): RangeMetric[] {
  return [
    {
      key: 'pressure',
      title: 'Presión de sustitución por IA sola',
      range: horizon.aiAloneSubstitutionPressurePctRange,
      suffix: '%',
      unit: 'Estimación porcentual de escenario, sin calibración',
      explanation:
        'Explora cuánto trabajo valioso podría realizar una IA con supervisión mínima. No representa una probabilidad de despido.',
    },
    {
      key: 'resilience',
      title: 'Resiliencia de un profesional que usa IA',
      range: horizon.aiNativeResilienceIndexRange,
      suffix: '',
      unit: 'Índice heurístico de 0 a 100; no es una probabilidad',
      explanation:
        'Mayor valor significa que una persona actualizada, con criterio y responsabilidad, podría conservar más valor económico.',
    },
    {
      key: 'compression',
      title: 'Presión para reducir plantillas',
      range: horizon.headcountCompressionIndexRange,
      suffix: '',
      unit: 'Índice heurístico de 0 a 100; no es porcentaje de empleos perdidos',
      explanation:
        'Un rol puede seguir existiendo y ser útil mientras la productividad permite realizar el mismo trabajo con menos personas.',
    },
  ];
}

export function ProfessionalResilienceComparison({ data }: { data: CareerResilienceData }) {
  const [roleId, setRoleId] = useState('software-engineer');
  const [horizonKey, setHorizonKey] = useState<CareerResilienceHorizonKey>('Y1');

  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <section className={styles.unavailable} aria-label="Resiliencia profesional">
        {data.notice ?? 'Sin evidencia suficiente para mostrar resiliencia profesional.'}
      </section>
    );
  }

  const snapshot = data.snapshot;
  const role = snapshot.roles.find((entry) => entry.id === roleId) ?? snapshot.roles[0];
  const horizon = role.horizons[horizonKey];
  const selectedHorizon = HORIZONS.find((item) => item.key === horizonKey);
  const stressTest = horizonKey === 'Y20';
  const spanish = resilienceSpanishLists(role, snapshot.source.commit);

  return (
    <section className={styles.section} aria-labelledby="professional-resilience-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Resiliencia profesional ante la IA · 11 perfiles</p>
        <h2 id="professional-resilience-title">
          ¿Cómo cambia el valor de tu trabajo si avanza la automatización?
        </h2>
        <p>
          Compará escenarios de un profesional que se mantiene actualizado y utiliza IA. Las bandas
          reflejan estimaciones de PAS, no frecuencias observadas ni predicciones de desempleo.
        </p>
      </div>

      {data.notice ? (
        <p className={styles.notice} role="status">
          {data.notice}
        </p>
      ) : null}

      <aside
        className={styles['calibration-notice']}
        aria-label="Cómo interpretar estos escenarios"
      >
        <strong>Escenarios exploratorios · sin calibración estadística</strong>
        <p>
          Un rango de 60–95% NO significa una probabilidad del 60–95% de perder el empleo, ni un
          porcentaje observado de puestos automatizados. Es un supuesto de escenario sobre capacidad
          de IA. Los otros dos rangos son índices heurísticos, no probabilidades ni porcentajes de
          despidos.
        </p>
      </aside>

      <div className={styles.controls}>
        <div className={styles['role-filter']}>
          <label htmlFor="resilience-role">Profesión</label>
          <select
            id="resilience-role"
            value={role.id}
            onChange={(event) => setRoleId(event.target.value)}
          >
            {snapshot.roles.map((item) => (
              <option value={item.id} key={item.id}>
                {ROLE_NAMES[item.id] ?? item.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className={styles['horizon-filter']}>
          <legend>Horizonte</legend>
          <div className={styles['horizon-options']}>
            {HORIZONS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={horizonKey === item.key}
                onClick={() => setHorizonKey(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {stressTest ? (
        <p className={styles['stress-warning']} role="status">
          <strong>20 años: prueba de estrés.</strong> No es una predicción concreta de cómo será el
          empleo en 2046. La incertidumbre es extremadamente alta.
        </p>
      ) : null}

      <div className={styles['role-heading']} aria-live="polite">
        <h3>{ROLE_NAMES[role.id] ?? role.name}</h3>
        <span>
          {selectedHorizon?.label} · confianza{' '}
          {CONFIDENCE[horizon.confidence]?.toLowerCase() ?? 'no disponible'}
        </span>
      </div>

      <div className={styles['metrics-grid']}>
        {metrics(horizon).map((metric) => (
          <RangeBand key={metric.key} metric={metric} />
        ))}
      </div>

      <ProfessionalResilienceTimeline role={role} selected={horizonKey} onSelect={setHorizonKey} />

      <div className={styles['interpretation-grid']}>
        <article>
          <h4>Cómo proteger tu valor profesional</h4>
          <p>
            {ROLE_ADAPTATION[role.id] ??
              'Desarrollá habilidades transferibles y evidencia profesional.'}
          </p>
          <details>
            <summary>Ver capacidades y recomendaciones en español</summary>
            {spanish ? (
              <>
                <h5>Trabajo humano clave</h5>
                <ul>
                  {spanish.human.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <h5>Cómo prepararte</h5>
                <ul>
                  {spanish.playbook.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>La traducción necesita revisión porque cambió la fuente canónica.</p>
            )}
            <details>
              <summary>Consultar texto original en inglés</summary>
              <ul>
                {[...role.loadBearingHumanWork, ...role.protectionPlaybook].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </details>
        </article>
        <article>
          <h4>Señales que podrían cambiarlo</h4>
          <p>
            Lo importante es observar autonomía fiable, adopción empresarial, contratación y
            capacidades que las organizaciones todavía necesitan supervisar.
          </p>
          <details>
            <summary>Ver señales e indicadores en español</summary>
            {spanish ? (
              <>
                <h5>Señales de mayor automatización</h5>
                <ul>
                  {spanish.up.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <h5>Señales de mayor demanda o responsabilidad humana</h5>
                <ul>
                  {spanish.down.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>La traducción necesita revisión porque cambió la fuente canónica.</p>
            )}
            <details>
              <summary>Consultar texto original en inglés</summary>
              <ul>
                {[...role.riskUpSignposts, ...role.riskDownSignposts].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </details>
        </article>
      </div>

      <p className={styles.footer}>
        Tres magnitudes distintas: una banda porcentual de escenario y dos índices heurísticos
        independientes. No deben sumarse ni promediarse para elegir una carrera. Fuente: PAS ·
        observado {snapshot.source.observedAt} ·{' '}
        <a
          href={
            'https://github.com/franciscovitar/personal-ai-system/blob/' +
            snapshot.source.commit +
            '/' +
            snapshot.source.canonicalRef
          }
          target="_blank"
          rel="noreferrer"
        >
          estudio y fuentes
        </a>
        . El resumen completo y sus limitaciones están disponibles en el análisis original.
      </p>
    </section>
  );
}
