import type { ProfessionalOfferVariant } from '@/types/professional-offers';

export interface ToolTask {
  id: string;
  label: string;
  description: string;
  channels: readonly string[];
}

// Eligibility by registered channel, not measured performance; V09/V10 stay on hold.
// The source catalog covers individual coding plans (SOFTWARE_ENGINEERING_GENERAL).
// Order follows the PAS visualization design; the first task is the default.
export const TOOL_TASKS: readonly ToolTask[] = [
  {
    id: 'coding',
    label: 'Programar en general',
    description:
      'Planes con app, agente de código, IDE o CLI registrados. Es la familia para la que se recopiló el catálogo.',
    channels: ['APP', 'CODEX', 'CLAUDE_CODE', 'IDE', 'CLI'],
  },
  {
    id: 'debug',
    label: 'Debugging de repos',
    description:
      'Planes con un canal que trabaja sobre el repositorio: agente de código, IDE, CLI o agente en la nube.',
    channels: ['CODEX', 'CLAUDE_CODE', 'IDE', 'CLI', 'CLOUD_AGENT'],
  },
  {
    id: 'frontend',
    label: 'Frontend y UI',
    description:
      'Mismos canales que Backend: todavía no hay evidencia que separe candidatos por tipo de interfaz.',
    channels: ['CODEX', 'CLAUDE_CODE', 'IDE', 'CLI'],
  },
  {
    id: 'backend',
    label: 'Backend y APIs',
    description:
      'Mismos canales que Frontend: todavía no hay evidencia que separe candidatos por servicios o APIs.',
    channels: ['CODEX', 'CLAUDE_CODE', 'IDE', 'CLI'],
  },
  {
    id: 'research',
    label: 'Investigación',
    description:
      'Planes con app conversacional o trabajo asistido. El catálogo es de programación y no evalúa investigación.',
    channels: ['APP', 'WORK'],
  },
  {
    id: 'study',
    label: 'Estudio',
    description:
      'Planes con app conversacional. No se midió precisión docente ni transferencia de lo aprendido.',
    channels: ['APP'],
  },
  {
    id: 'data',
    label: 'Análisis de datos',
    description:
      'Planes con app, trabajo asistido o herramientas de código. La ejecución real de análisis no se evaluó.',
    channels: ['APP', 'WORK', 'CODEX', 'CLAUDE_CODE', 'IDE'],
  },
  {
    id: 'browser',
    label: 'Navegador y agentes',
    description:
      'Sólo planes con un canal de trabajo asistido registrado. No equivale a autonomía probada.',
    channels: ['WORK'],
  },
];

export type ToolOfferFilter = 'all' | 'free' | 'under20' | 'daily';

const DAILY_FITS = new Set(['REGULAR', 'FREQUENT', 'DAILY_AGENT', 'DAILY_HIGH', 'POWER_USER']);

export function resolveToolTask(id: string | undefined): ToolTask {
  return TOOL_TASKS.find((task) => task.id === id) ?? TOOL_TASKS[0];
}

export function eligibleToolOffers(
  offers: readonly ProfessionalOfferVariant[],
  allowedOfferIds: readonly string[],
  task: ToolTask,
  filter: ToolOfferFilter,
): ProfessionalOfferVariant[] {
  const allowed = new Set(allowedOfferIds);
  return offers.filter((offer) => {
    if (
      !allowed.has(offer.id) ||
      !offer.channels.some((channel) => task.channels.includes(channel))
    ) {
      return false;
    }
    if (filter === 'free') return offer.headlinePriceUsdMonthly === 0;
    if (filter === 'under20') return offer.headlinePriceUsdMonthly <= 20;
    if (filter === 'daily') return DAILY_FITS.has(offer.sustainedUseFit);
    return true;
  });
}

// One entry plan per product; alphabetical by product name, not a quality ranking.
export function representativeToolOffers(
  offers: readonly ProfessionalOfferVariant[],
  filter: ToolOfferFilter,
): ProfessionalOfferVariant[] {
  const byProduct = new Map<string, ProfessionalOfferVariant[]>();
  for (const offer of offers) {
    const key = `${offer.provider}::${offer.product}`;
    const existing = byProduct.get(key) ?? [];
    existing.push(offer);
    byProduct.set(key, existing);
  }
  return [...byProduct.values()]
    .sort((a, b) => (a[0]?.product ?? '').localeCompare(b[0]?.product ?? '', 'es'))
    .map((variants) => {
      const sorted = [...variants].sort(
        (a, b) => a.headlinePriceUsdMonthly - b.headlinePriceUsdMonthly,
      );
      // Default to the least expensive paid plan; keep Free in the full list.
      return filter === 'all'
        ? (sorted.find((offer) => offer.headlinePriceUsdMonthly > 0) ?? sorted[0])
        : sorted[0];
    });
}

export function modelAccessLabel(offer: ProfessionalOfferVariant): string {
  const declarations = offer.included.filter((item) =>
    /\bGPT-\d|\bmodelos?\b|\bmodels?\b/i.test(item),
  );
  return declarations.length > 0
    ? declarations.join(' · ')
    : 'La fuente de este plan no identifica un modelo fijo.';
}
