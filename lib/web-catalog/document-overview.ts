import type { Domain } from '@/types';
import type { ContentBlock, ContentPage } from '@/types/content';

export type DocumentPresentation =
  'document' | 'north' | 'learning' | 'purchases' | 'diet' | 'faculty';

export interface DocumentSectionSlice {
  key: string;
  title: string;
  blocks: readonly ContentBlock[];
}

export interface DocumentOverviewCard {
  key: string;
  title: string;
  description: string | null;
  items: readonly string[];
  count: number | null;
  domain: Domain;
  emphasis: 'default' | 'strong' | 'muted';
}

export interface DocumentOverviewModel {
  presentation: Exclude<DocumentPresentation, 'document'>;
  eyebrow: string;
  title: string;
  description: string | null;
  cards: readonly DocumentOverviewCard[];
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function plainBlockText(block: ContentBlock): string {
  return block.text
    .map((part) => part.plain)
    .join('')
    .trim();
}

function isHeading(block: ContentBlock, level: 1 | 2): boolean {
  return block.type === `heading_${level}`;
}

export function splitDocumentSections(
  blocks: readonly ContentBlock[],
  level: 1 | 2 = 1,
): DocumentSectionSlice[] {
  const sections: DocumentSectionSlice[] = [];
  let current: DocumentSectionSlice | null = null;

  for (const block of blocks) {
    if (isHeading(block, level)) {
      if (current) sections.push(current);
      current = {
        key: block.localId,
        title: plainBlockText(block),
        blocks: [],
      };
      continue;
    }

    if (!current) continue;
    current = { ...current, blocks: [...current.blocks, block] };
  }

  if (current) sections.push(current);
  return sections.filter((section) => section.title.length > 0);
}

export function findDocumentSection(
  sections: readonly DocumentSectionSlice[],
  ...titles: readonly string[]
): DocumentSectionSlice | null {
  const expected = new Set(titles.map(normalize));
  return sections.find((section) => expected.has(normalize(section.title))) ?? null;
}

function paragraphTexts(blocks: readonly ContentBlock[]): string[] {
  return blocks
    .filter(
      (block) => block.type === 'paragraph' || block.type === 'quote' || block.type === 'callout',
    )
    .map(plainBlockText)
    .filter(Boolean);
}

function listTexts(blocks: readonly ContentBlock[]): string[] {
  const output: string[] = [];
  const visit = (items: readonly ContentBlock[]) => {
    for (const block of items) {
      if (
        block.type === 'bulleted_list_item' ||
        block.type === 'numbered_list_item' ||
        block.type === 'to_do'
      ) {
        const text = plainBlockText(block);
        if (text) output.push(text);
      }
      if (block.children.length > 0) visit(block.children);
    }
  };
  visit(blocks);
  return output;
}

function sectionDescription(section: DocumentSectionSlice | null): string | null {
  if (!section) return null;
  return paragraphTexts(section.blocks)[0] ?? null;
}

function sectionItems(section: DocumentSectionSlice | null, limit = 6): string[] {
  if (!section) return [];
  return listTexts(section.blocks).slice(0, limit);
}

function sectionCount(section: DocumentSectionSlice | null): number | null {
  if (!section) return null;
  const count = listTexts(section.blocks).length;
  return count > 0 ? count : null;
}

function card(
  key: string,
  title: string,
  section: DocumentSectionSlice | null,
  domain: Domain,
  emphasis: DocumentOverviewCard['emphasis'] = 'default',
  limit = 6,
): DocumentOverviewCard | null {
  if (!section) return null;
  return {
    key,
    title,
    description: sectionDescription(section),
    items: sectionItems(section, limit),
    count: sectionCount(section),
    domain,
    emphasis,
  };
}

function compact<T>(values: readonly (T | null)[]): T[] {
  return values.filter((value): value is T => value !== null);
}

function topLevelHeadingSet(page: ContentPage): Set<string> {
  return new Set(splitDocumentSections(page.blocks).map((section) => normalize(section.title)));
}

function hasAll(headings: ReadonlySet<string>, values: readonly string[]): boolean {
  return values.every((value) => headings.has(normalize(value)));
}

export function detectDocumentPresentation(page: ContentPage): DocumentPresentation {
  const headings = topLevelHeadingSet(page);

  if (
    hasAll(headings, ['Temporada actual', 'Objetivo principal', 'Prioridades', 'Fuera de foco'])
  ) {
    return 'north';
  }
  if (hasAll(headings, ['Activo', 'Pasivo', 'Algún día', 'Consolidado'])) {
    return 'learning';
  }
  if (hasAll(headings, ['Comprar', 'Reponer', 'Investigar antes'])) {
    return 'purchases';
  }
  if (hasAll(headings, ['Objetivo', 'Meal prep semanal', 'Lista de compra principal'])) {
    return 'diet';
  }
  if (hasAll(headings, ['Materias activas', 'Próximos bloques recomendados', 'Regla'])) {
    return 'faculty';
  }
  return 'document';
}

function northOverview(page: ContentPage): DocumentOverviewModel {
  const sections = splitDocumentSections(page.blocks);
  const season = findDocumentSection(sections, 'Temporada actual');
  const objective = findDocumentSection(sections, 'Objetivo principal');
  const priorities = findDocumentSection(sections, 'Prioridades');
  const study = findDocumentSection(sections, 'Estudio');
  const idealWeek = findDocumentSection(sections, 'Semana ideal');
  const dayTypes = findDocumentSection(sections, 'Tipos de día');
  const success = findDocumentSection(sections, 'Criterios de éxito');
  const rules = findDocumentSection(sections, 'Reglas de la temporada');
  const outOfFocus = findDocumentSection(sections, 'Fuera de foco');
  const guide = findDocumentSection(sections, 'Frase guía');
  const seasonParagraphs = season ? paragraphTexts(season.blocks) : [];

  const seasonCard: DocumentOverviewCard | null = season
    ? {
        key: 'season',
        title: 'Temporada y revisión',
        description: seasonParagraphs[0] ?? null,
        items: seasonParagraphs.slice(1, 4),
        count: null,
        domain: 'neutral',
        emphasis: 'strong',
      }
    : null;

  return {
    presentation: 'north',
    eyebrow: 'Dirección de la temporada',
    title: page.title,
    description: sectionDescription(objective),
    cards: compact([
      seasonCard,
      card('priorities', 'Prioridades', priorities, 'projects', 'strong'),
      card('study', 'Estudio', study, 'learning'),
      card('ideal-week', 'Semana ideal', idealWeek, 'productivity'),
      card('day-types', 'Tipos de día', dayTypes, 'habits'),
      card('success', 'Criterios de éxito', success, 'habits'),
      card('rules', 'Reglas de la temporada', rules, 'productivity'),
      card('out-of-focus', 'Fuera de foco', outOfFocus, 'neutral', 'muted'),
      card('guide', 'Frase guía', guide, 'productivity', 'strong'),
    ]),
  };
}

function learningOverview(page: ContentPage): DocumentOverviewModel {
  const sections = splitDocumentSections(page.blocks);
  const active = findDocumentSection(sections, 'Activo');
  const passive = findDocumentSection(sections, 'Pasivo');
  const someday = findDocumentSection(sections, 'Algún día');
  const consolidated = findDocumentSection(sections, 'Consolidado');

  return {
    presentation: 'learning',
    eyebrow: 'Mapa de aprendizaje',
    title: 'Qué está activo y qué puede esperar',
    description: sectionDescription(active),
    cards: compact([
      card('active', 'Activo', active, 'learning', 'strong', 8),
      card('passive', 'Pasivo', passive, 'neutral', 'default', 8),
      card('someday', 'Algún día', someday, 'neutral', 'muted', 8),
      card('consolidated', 'Consolidado', consolidated, 'habits', 'default', 8),
    ]),
  };
}

function purchasesOverview(page: ContentPage): DocumentOverviewModel {
  const sections = splitDocumentSections(page.blocks);
  const buy = findDocumentSection(sections, 'Comprar');
  const replenish = findDocumentSection(sections, 'Reponer');
  const investigate = findDocumentSection(sections, 'Investigar antes');

  return {
    presentation: 'purchases',
    eyebrow: 'Compras abiertas',
    title: 'Capturar primero, decidir después',
    description:
      'Vista de solo lectura. Investigar no convierte automáticamente una compra en tarea.',
    cards: compact([
      card('buy', 'Comprar', buy, 'tasks', 'strong', 7),
      card('replenish', 'Reponer', replenish, 'habits', 'default', 7),
      card('investigate', 'Investigar antes', investigate, 'learning', 'muted', 7),
    ]),
  };
}

function dietOverview(page: ContentPage): DocumentOverviewModel {
  const sections = splitDocumentSections(page.blocks);
  const objective = findDocumentSection(sections, 'Objetivo');
  const mealPrep = findDocumentSection(sections, 'Meal prep semanal');
  const mealPrepSubsections = mealPrep ? splitDocumentSections(mealPrep.blocks, 2) : [];
  const quickMeals = findDocumentSection(
    mealPrepSubsections,
    'Comidas rápidas para resolver en 10 minutos',
  );
  const shopping = findDocumentSection(sections, 'Lista de compra principal');
  const supplements = findDocumentSection(sections, 'Suplementos');
  const additions = findDocumentSection(sections, 'Posibles agregados');

  return {
    presentation: 'diet',
    eyebrow: 'Sistema de alimentación',
    title: sectionDescription(objective) ?? page.title,
    description:
      'Resumen operativo; las cantidades y criterios completos siguen en el documento de Notion.',
    cards: compact([
      card('meal-prep', 'Meal prep semanal', mealPrep, 'health', 'strong', 8),
      card('quick-meals', 'Comidas en 10 minutos', quickMeals, 'habits', 'default', 8),
      card('shopping', 'Lista principal', shopping, 'tasks', 'default', 8),
      card('supplements', 'Suplementos', supplements, 'health', 'muted', 6),
      card('additions', 'Posibles agregados', additions, 'learning', 'muted', 6),
    ]),
  };
}

function facultyOverview(page: ContentPage): DocumentOverviewModel {
  const sections = splitDocumentSections(page.blocks);
  const season = findDocumentSection(sections, 'Temporada actual');
  const subjects = findDocumentSection(sections, 'Materias activas');
  const nextBlocks = findDocumentSection(sections, 'Próximos bloques recomendados');
  const rule = findDocumentSection(sections, 'Regla');
  const subjectSections = subjects ? splitDocumentSections(subjects.blocks, 2) : [];
  const subjectItems = subjectSections.map((section) => section.title).filter(Boolean);

  const subjectsCard: DocumentOverviewCard | null = subjects
    ? {
        key: 'subjects',
        title: 'Materias activas',
        description: sectionDescription(subjects),
        items: subjectItems,
        count: subjectItems.length > 0 ? subjectItems.length : null,
        domain: 'learning',
        emphasis: 'strong',
      }
    : null;

  return {
    presentation: 'faculty',
    eyebrow: 'Panel académico',
    title: sectionDescription(season) ?? page.title,
    description:
      'Elegir un bloque principal y sostener una versión mínima cuando el día se complica.',
    cards: compact([
      subjectsCard,
      card('next-blocks', 'Próximos bloques', nextBlocks, 'tasks', 'default', 6),
      card('rule', 'Regla de estudio', rule, 'productivity', 'muted', 4),
    ]),
  };
}

export function buildDocumentOverview(
  page: ContentPage,
  presentation: DocumentPresentation = detectDocumentPresentation(page),
): DocumentOverviewModel | null {
  let overview: DocumentOverviewModel | null = null;
  if (presentation === 'north') overview = northOverview(page);
  if (presentation === 'learning') overview = learningOverview(page);
  if (presentation === 'purchases') overview = purchasesOverview(page);
  if (presentation === 'diet') overview = dietOverview(page);
  if (presentation === 'faculty') overview = facultyOverview(page);
  return overview && overview.cards.length > 0 ? overview : null;
}
