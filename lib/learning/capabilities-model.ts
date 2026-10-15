const CURATED_FIELDS = [
  'what_you_get',
  'specific_benefits',
  'also_helps_with',
  'target_feel',
  'learning_feel',
  'fine_print',
  'if_never_learned',
] as const;

type JsonRecord = Record<string, unknown>;
type CapabilityCard = {
  whatYouGet: string;
  benefits: string[];
  relatedBenefits: Array<{ area: string; how: string; evidence: string }>;
  targetFeel: string;
  learningFeel: string;
  difficulty: string;
  friction: string;
  infrastructure: string;
  maintenance: string;
  ifNeverLearned: string;
};
export type CapabilityItem = {
  id: string;
  name: string;
  area: string;
  subcategory: string;
  status: 'curated' | 'discovery';
  card: CapabilityCard | null;
  genericHours: string[];
  timeConfidence: string | null;
  primaryRoute: string | null;
  learningRoute: string | null;
};
export type CapabilityLibraryRead = {
  status: 'ready' | 'unconfigured' | 'unavailable' | 'invalid';
  items: CapabilityItem[];
  initialIds: string[];
  updated: string | null;
  sourceCommit: string | null;
  notice: string | null;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function rows(value: unknown): JsonRecord[] {
  const items = record(value).items;
  return Array.isArray(items) ? items.map(record) : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function evidenceLabel(value: unknown): string {
  const labels: Record<string, string> = {
    DIRECT_CONTEXT: 'Uso directo en ese contexto',
    DIRECT_NEAR_TRANSFER: 'Transferencia a un ámbito cercano',
    DIRECT_USE: 'Uso directo',
    NEAR_ONLY: 'Relación cercana',
    PLAUSIBLE_DIRECT: 'Posible efecto directo',
    PLAUSIBLE_NEAR_TRANSFER: 'Transferencia cercana plausible',
    SUPPORTED_ASSOCIATION: 'Asociación respaldada',
    SUPPORTED_DIRECT: 'Efecto directo respaldado',
    SUPPORTED_DIRECT_NEAR: 'Transferencia cercana respaldada',
    SUPPORTED_SMALL_EFFECT: 'Efecto pequeño respaldado',
  };
  return typeof value === 'string'
    ? (labels[value] ?? 'Alcance del beneficio no especificado')
    : 'Alcance del beneficio no especificado';
}

function difficultyLabel(value: unknown): string {
  if (typeof value !== 'string') return 'Sin dato';
  const labels: Record<string, string> = {
    BAJA_A_MEDIA_HASTA_L2: 'De baja a media hasta el nivel 2',
    BAJA_A_MEDIA_PARA_BASE_FUNCIONAL: 'De baja a media hasta una base funcional',
    BAJA_A_MEDIA_PARA_L2: 'De baja a media hasta el nivel 2',
    MEDIA: 'Media',
    MEDIA_Y_CONTINUA: 'Media; requiere continuidad',
  };
  return labels[value] ?? value;
}

export function validCapabilityDataset(
  inventory: unknown,
  cards: unknown,
  times: unknown,
  routing: unknown,
): boolean {
  const inventoryRows = rows(inventory);
  const cardRows = rows(cards);
  const timeRows = rows(times);
  const routeRows = rows(routing);
  const ids = inventoryRows.map((item) => text(item.id));
  const areas = new Set(inventoryRows.map((item) => text(item.pillar)));
  if (
    inventoryRows.length !== 245 ||
    new Set(ids).size !== 245 ||
    ids.some((id) => !id || !/^GC-\d{3}$/.test(id)) ||
    cardRows.length !== 245 ||
    timeRows.length !== 245 ||
    routeRows.length !== 245 ||
    areas.size !== 7 ||
    [...areas].some(
      (area) =>
        !area ||
        ![
          'skills',
          'knowledge',
          'character',
          'experiences',
          'presence',
          'resources',
          'relationships',
        ].includes(area),
    )
  ) {
    return false;
  }
  const curated = cardRows.filter((item) => item.status === 'CURATED_V1');
  if (curated.length !== 12) return false;
  const cardById = new Map(cardRows.map((item) => [text(item.generalist_item_id), item]));
  const timeById = new Map(timeRows.map((item) => [text(item.generalist_item_id), item]));
  const routeById = new Map(routeRows.map((item) => [text(item.generalist_item_id), item]));
  return (
    inventoryRows.every((item) => {
      const id = text(item.id);
      const card = cardById.get(id);
      const time = timeById.get(id);
      const route = routeById.get(id);
      return Boolean(card && time && route && text(card.name) === text(item.name));
    }) &&
    curated.every((item) => {
      const card = record(item.card);
      const finePrint = record(card.fine_print);
      return (
        CURATED_FIELDS.every((field) => field in card) &&
        ['what_you_get', 'target_feel', 'learning_feel', 'if_never_learned'].every((field) =>
          Boolean(text(card[field])),
        ) &&
        textArray(card.specific_benefits).length > 0 &&
        ['difficulty', 'friction', 'infrastructure', 'maintenance'].every((field) =>
          Boolean(text(finePrint[field])),
        )
      );
    })
  );
}

function localizedArea(value: string): string {
  const names: Record<string, string> = {
    skills: 'Habilidades',
    knowledge: 'Conocimientos',
    character: 'Carácter',
    experiences: 'Experiencias',
    presence: 'Presencia',
    resources: 'Recursos',
    relationships: 'Relaciones',
  };
  return names[value] ?? value;
}

export function projectCapabilityData(
  inventory: unknown,
  cards: unknown,
  times: unknown,
  routing: unknown,
): CapabilityItem[] {
  const cardMap = new Map(rows(cards).map((row) => [text(row.generalist_item_id), row]));
  const timeMap = new Map(rows(times).map((row) => [text(row.generalist_item_id), row]));
  const routeMap = new Map(rows(routing).map((row) => [text(row.generalist_item_id), row]));

  return rows(inventory).flatMap((row) => {
    const id = text(row.id);
    const name = text(row.name);
    const pillar = text(row.pillar);
    if (!id || !name || !pillar) return [];
    const cardRecord = record(cardMap.get(id)?.card);
    const curated = cardMap.get(id)?.status === 'CURATED_V1';
    const finePrint = record(cardRecord.fine_print);
    const time = timeMap.get(id) ?? {};
    const route = routeMap.get(id) ?? {};
    const learningRoute = Array.isArray(route.routes)
      ? route.routes
          .map(record)
          .find(
            (item) =>
              item.engine === 'LEARNING_OS' &&
              item.role === 'ON_DEMAND' &&
              item.trigger === 'ONLY_AFTER_EXPLICIT_LEARNING_OR_PRACTICE_ACTIVATION',
          )
      : null;
    const genericHours = textArray(time.generic_cumulative_active_hours_from_level_0);
    const card: CapabilityCard | null = curated
      ? {
          whatYouGet: text(cardRecord.what_you_get) ?? '',
          benefits: textArray(cardRecord.specific_benefits),
          relatedBenefits: Array.isArray(cardRecord.also_helps_with)
            ? cardRecord.also_helps_with.map(record).flatMap((item) => {
                const area = text(item.area);
                const how = text(item.how);
                return area && how ? [{ area, how, evidence: evidenceLabel(item.evidence) }] : [];
              })
            : [],
          targetFeel: text(cardRecord.target_feel) ?? '',
          learningFeel: text(cardRecord.learning_feel) ?? '',
          difficulty: difficultyLabel(finePrint.difficulty),
          friction: text(finePrint.friction) ?? 'Sin dato',
          infrastructure: text(finePrint.infrastructure) ?? 'Sin dato',
          maintenance: text(finePrint.maintenance) ?? 'Sin dato',
          ifNeverLearned: text(cardRecord.if_never_learned) ?? '',
        }
      : null;
    return [
      {
        id,
        name,
        area: localizedArea(pillar),
        subcategory: text(row.subcategory) ?? 'General',
        status: curated ? 'curated' : 'discovery',
        card,
        genericHours,
        timeConfidence: text(time.generic_confidence),
        primaryRoute: text(route.primary_route),
        learningRoute: learningRoute ? 'LEARNING_OS' : null,
      },
    ];
  });
}

export function initialDiscoveries(items: CapabilityItem[]): string[] {
  const selected: string[] = [];
  const areas = new Set<string>();
  for (const item of items) {
    if (item.status !== 'curated' || areas.has(item.area)) continue;
    areas.add(item.area);
    selected.push(item.id);
    if (selected.length === 3) break;
  }
  return selected;
}

export function inventoryUpdatedAt(value: unknown): string | null {
  return text(record(value).updated);
}
