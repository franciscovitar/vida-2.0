import snapshot from '@/data/generated/professional-ai-benchmark-livebench.json';

type BenchmarkMetric = 'coding' | 'agenticCoding' | 'dataAnalysis' | 'reasoning';
type Applicability = 'DIRECT_CATEGORY' | 'PROXY' | 'UNAVAILABLE';

interface BenchmarkTaskMatch {
  metric: BenchmarkMetric | null;
  label: string;
  applicability: Applicability;
  caveat: string;
}

// The public dataset evaluates model configurations, not subscriptions or tools.
// "PROXY" never establishes that a model is best for the selected user task.
const TASK_MATCHES: Readonly<Record<string, BenchmarkTaskMatch>> = {
  coding: {
    metric: 'coding',
    label: 'Programación: resultados en Coding',
    applicability: 'DIRECT_CATEGORY',
    caveat: 'Evalúa tareas de código de LiveBench; no mide tu repositorio ni garantiza un resultado en producción.',
  },
  debug: {
    metric: 'agenticCoding',
    label: 'Agentes de código: indicador para debugging',
    applicability: 'PROXY',
    caveat: 'Agentic Coding NO es un test exclusivo de depuración ni de resolución de errores en repositorios.',
  },
  frontend: {
    metric: 'agenticCoding',
    label: 'Agentes de código: referencia para frontend',
    applicability: 'PROXY',
    caveat: 'No mide calidad visual, accesibilidad, diseño ni ejecución específica de interfaces.',
  },
  backend: {
    metric: 'agenticCoding',
    label: 'Agentes de código: referencia para backend',
    applicability: 'PROXY',
    caveat: 'No mide específicamente APIs, seguridad, bases de datos ni backend productivo.',
  },
  research: {
    metric: 'reasoning',
    label: 'Razonamiento: referencia indirecta para investigación',
    applicability: 'PROXY',
    caveat: 'Reasoning no mide búsqueda web, cobertura bibliográfica, actualidad ni fidelidad de las fuentes.',
  },
  study: {
    metric: 'reasoning',
    label: 'Razonamiento: referencia indirecta para estudiar',
    applicability: 'PROXY',
    caveat: 'Reasoning no mide calidad docente, explicación, práctica ni aprendizaje retenido.',
  },
  data: {
    metric: 'dataAnalysis',
    label: 'Análisis de datos: resultados en Data Analysis',
    applicability: 'DIRECT_CATEGORY',
    caveat: 'Evalúa los ejercicios de Data Analysis de LiveBench; no certifica archivos ni decisiones del usuario.',
  },
  browser: {
    metric: null,
    label: 'Sin benchmark directo validado para navegador',
    applicability: 'UNAVAILABLE',
    caveat: 'No usamos Agentic Coding para atribuir capacidad de navegación web ni autonomía con aplicaciones.',
  },
};
const DEFAULT_MATCH = TASK_MATCHES.coding!;

export function benchmarkForTask(taskId: string, now = new Date()) {
  const match = TASK_MATCHES[taskId] ?? DEFAULT_MATCH;
  const source = snapshot.source;
  const raw = snapshot.models;
  const observedTime = Date.parse(source.observedAt + 'T00:00:00Z');
  const stale =
    !Number.isFinite(observedTime) ||
    now.getTime() - observedTime > source.staleAfterDays * 86400000;

  const ids = new Set<string>();
  const isValid =
    source.kind === 'PUBLIC_BENCHMARK_SNAPSHOT' &&
    source.url.startsWith('https://') &&
    /^\d{4}-\d{2}-\d{2}$/.test(source.release) &&
    Number.isFinite(observedTime) &&
    raw.length >= 4 &&
    raw.every((entry) => {
      if (!entry.id || ids.has(entry.id) || !entry.name || !entry.provider || !entry.effort) {
        return false;
      }
      ids.add(entry.id);
      return (
        Object.values(entry.scores).length === 4 &&
        Object.values(entry.scores).every(
          (value) =>
            typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100,
        )
      );
    });

  const rows =
    isValid && match.metric !== null
      ? raw
          .map((entry) => ({
            id: entry.id,
            name: entry.name,
            provider: entry.provider,
            effort: entry.effort,
            score: entry.scores[match.metric!],
          }))
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'es'))
      : [];

  return { match, source, stale, valid: isValid, rows };
}
