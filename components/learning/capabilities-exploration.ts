import type { CapabilityItem } from '@/lib/learning/capabilities-model';

export const CAPABILITY_PAGE_SIZE = 12;
export const EMPTY_CAPABILITY_FILTERS: CapabilityFilters = {
  query: '',
  area: '',
  subcategory: '',
  content: 'all',
};

export type CapabilityFilters = {
  query: string;
  area: string;
  subcategory: string;
  content: 'all' | 'curated' | 'discovery';
};

function searchable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

const SUBCATEGORIES: Record<string, string> = {
  automotive: 'Automotores',
  autonomy: 'Autonomía',
  body_language: 'Lenguaje corporal',
  communication: 'Comunicación',
  community: 'Comunidad',
  coordination: 'Coordinación',
  core: 'Fundamentos',
  creative: 'Creatividad',
  culture: 'Cultura',
  current: 'Actualidad',
  dance: 'Danza',
  digital: 'Entorno digital',
  diversity: 'Diversidad',
  energy: 'Energía',
  family: 'Familia',
  friendship: 'Amistad',
  games: 'Juegos',
  grooming: 'Cuidado personal',
  growth: 'Crecimiento',
  health: 'Salud',
  human: 'Ser humano',
  humanities: 'Humanidades',
  information: 'Información',
  languages: 'Idiomas',
  learning: 'Aprendizaje',
  mobility: 'Movilidad',
  money: 'Dinero',
  music: 'Música',
  nature: 'Naturaleza',
  network: 'Red de contactos',
  organization: 'Organización',
  outdoors: 'Aire libre',
  partner: 'Pareja',
  practical: 'Práctica',
  projects: 'Proyectos',
  relationships: 'Relaciones',
  safety: 'Prevención y seguridad',
  science: 'Ciencia',
  security: 'Seguridad',
  sensory: 'Sensorial',
  social: 'Vida social',
  society: 'Sociedad',
  sports: 'Deportes',
  style: 'Estilo',
  support: 'Apoyo',
  technology: 'Tecnología',
  thinking: 'Pensamiento',
  time: 'Tiempo',
  travel: 'Viajes',
  voice: 'Voz',
  work: 'Trabajo',
  world: 'Mundo',
};

export function subcategoryLabel(value: string): string {
  const words = value.replaceAll('_', ' ');
  return Object.hasOwn(SUBCATEGORIES, value)
    ? SUBCATEGORIES[value]!
    : words.charAt(0).toLocaleUpperCase('es') + words.slice(1);
}

export function timeConfidenceLabel(item: CapabilityItem): string {
  const labels: Record<string, string> = {
    LOW: 'Confianza baja',
    MEDIUM: 'Confianza media',
    HIGH: 'Confianza alta',
  };
  const key = item.timeConfidence ?? '';
  return Object.hasOwn(labels, key) ? labels[key]! : 'Confianza no indicada';
}

export function activeHoursLabel(range: { min: number; max: number }): string {
  const format = (value: number) => value.toLocaleString('es-AR', { maximumFractionDigits: 20 });
  const value =
    range.min === range.max ? format(range.min) : `${format(range.min)}–${format(range.max)}`;
  return `${value} horas activas`;
}

export function genericTimeSummary(item: CapabilityItem): string {
  const time = item.timeEstimate;
  const firstLevel = time.levelRanges[0];
  if (firstLevel) {
    return `${time.modelLabel ?? 'Horas activas por nivel'} · Nivel ${firstLevel.level}: ${activeHoursLabel(firstLevel)}`;
  }
  if (time.stateRange) {
    return `${time.modelLabel ?? 'Referencia de estado'} · ${activeHoursLabel(time.stateRange)}`;
  }
  return time.modelLabel ?? 'Referencia de esfuerzo no disponible';
}

export function capabilitySubcategories(items: CapabilityItem[], area: string): string[] {
  return [
    ...new Set(items.filter((item) => !area || item.area === area).map((item) => item.subcategory)),
  ].sort((a, b) => subcategoryLabel(a).localeCompare(subcategoryLabel(b), 'es'));
}

export function filterCapabilities(
  items: CapabilityItem[],
  filters: CapabilityFilters,
): CapabilityItem[] {
  const terms = searchable(filters.query.trim()).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const haystack = searchable(
      `${item.name} ${item.area} ${item.subcategory} ${subcategoryLabel(item.subcategory)}`,
    );
    return (
      (!filters.area || item.area === filters.area) &&
      (!filters.subcategory || item.subcategory === filters.subcategory) &&
      (filters.content === 'all' || item.status === filters.content) &&
      terms.every((term) => haystack.includes(term))
    );
  });
}

export function capabilityExcerpt(item: CapabilityItem): string {
  if (!item.card) {
    return [
      subcategoryLabel(item.subcategory),
      genericTimeSummary(item),
      timeConfidenceLabel(item),
    ].join(' · ');
  }
  const text = item.card.whatYouGet;
  if (text.length <= 150) return text;
  const clipped = text.slice(0, 150);
  const boundary = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, boundary > 100 ? boundary : 150).trimEnd()}…`;
}
