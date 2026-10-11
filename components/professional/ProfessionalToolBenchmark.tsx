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
            Resultados publicados por LiveBench. Son modelos, no planes de ChatGPT, Claude o Cursor.
          </p>
          <p className={ui['benchmark-explain']}>
            Los puntajes no son probabilidades de éxito para tu proyecto.
          </p>
          <div className={ui['benchmark-axis']} aria-hidden="true">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
          <div className={ui['benchmark-rows']} role="list">
            {rows.map((entry) => (
              <div className={ui['benchmark-row']} key={entry.id} role="listitem">
                <div className={ui['benchmark-model']}>
                  <strong>{entry.name}</strong>
                  <span>
                    {entry.provider} · {entry.effort}
                  </span>
                </div>
                <div
                  className={ui['benchmark-track']}
                  role="img"
                  aria-label={entry.name + ': ' + entry.score.toFixed(1) + ' de 100'}
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
        <a href={source.url} target="_blank" rel="noreferrer">
          Ver resultados y metodología
        </a>
      </div>
      <p className={ui['benchmark-scope']}>
        Muestra de ocho configuraciones, no toda la clasificación publicada.
      </p>
      <p className={ui['benchmark-scope']}>
        Su disponibilidad no se deduce de los planes ni de su precio mensual.
      </p>
      <p className={ui['benchmark-scope']}>
        V09 es evidencia pública orientativa. V10 y las pruebas personales siguen pendientes.
      </p>
    </section>
  );
}
