import { benchmarkForTask } from '@/lib/professional/tool-benchmarks';

import ui from './ProfessionalToolsComparison.module.scss';

export function ProfessionalToolBenchmark({ taskId }: { taskId: string }) {
  const { match, source, stale, valid, rows } = benchmarkForTask(taskId);
  const hasRows = valid && rows.length > 0;

  return (
    <section className={ui['benchmark-panel']} aria-labelledby="tool-benchmark-title">
      <div className={ui['benchmark-heading']}>
        <p className={ui['benchmark-kicker']}>01 · Rendimiento de modelos</p>
        <h3 id="tool-benchmark-title">{match.label}</h3>
        <span className={ui['benchmark-status']}>
          {match.applicability === 'DIRECT_CATEGORY'
            ? 'Categoría evaluada'
            : match.applicability === 'PROXY'
              ? 'Indicador indirecto'
              : 'Sin datos comparables'}
        </span>
      </div>
      <p className={ui['benchmark-caveat']}>{match.caveat}</p>
      {hasRows ? (
        <>
          <p className={ui['benchmark-explain']}>
            Resultados publicados por LiveBench en una misma categoría y edición. Son
            configuraciones de <strong>modelos</strong>, no planes de ChatGPT, Claude o Cursor.
            El puntaje no es una probabilidad de éxito en tu proyecto.
          </p>
          <div className={ui['benchmark-axis']} aria-hidden="true">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
          <div
            className={ui['benchmark-rows']}
            role="list"
            aria-label="Resultados de modelos en el benchmark"
          >
            {rows.map((entry) => (
              <div className={ui['benchmark-row']} key={entry.id} role="listitem">
                <div className={ui['benchmark-model']}>
                  <strong>{entry.name}</strong>
                  <span>{entry.provider} · {entry.effort}</span>
                </div>
                <div
                  className={ui['benchmark-track']}
                  role="img"
                  aria-label={
                    entry.name + ': ' + entry.score.toFixed(1) + ' de 100 en ' + match.label
                  }
                >
                  <span className={ui['benchmark-fill']} style={{ width: entry.score + '%' }} />
                </div>
                <strong className={ui['benchmark-number']}>{entry.score.toFixed(1)}</strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className={ui['benchmark-empty']}>
          {valid
            ? 'No hay una medición comparable publicada aquí para esta tarea. No se fabrica una clasificación.'
            : 'La fuente de resultados no pasó su validación; no se muestran puntuaciones.'}
        </p>
      )}
      <div className={ui['benchmark-footnote']}>
        <span>
          LiveBench · edición {source.release} · consultado {source.observedAt}
          {stale ? ' · corte histórico: requiere nueva consulta' : ''}.
        </span>
        <a href={source.url} target="_blank" rel="noreferrer">Ver resultados y metodología</a>
      </div>
      <p className={ui['benchmark-scope']}>
        Muestra deliberada de ocho modelos, no toda la clasificación. Cambian el esfuerzo y el acceso
        entre configuraciones. No se infiere su disponibilidad en un plan específico, ni se compara
        la calidad con el costo mensual de suscripción. V09 es evidencia pública orientativa;
        las evaluaciones propias y V10 (costo real por tarea resuelta) siguen pendientes.
      </p>
    </section>
  );
}
