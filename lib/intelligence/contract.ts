import type {
  IntelligenceArticle,
  IntelligenceArticleData,
  IntelligenceArticleSummary,
  IntelligenceEditorialData,
  IntelligenceEditorialSnapshot,
  IntelligenceFront,
  IntelligenceSourceRef,
} from '@/types/intelligence-editorial';

const FRONTS: readonly IntelligenceFront[] = ['ia', 'carrera', 'tecnologia', 'pas'];
const FRONT_SET = new Set<IntelligenceFront>(FRONTS);
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function everyArray<T>(value: unknown, predicate: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(predicate);
}

function validFront(value: unknown): value is IntelligenceFront {
  return typeof value === 'string' && FRONT_SET.has(value as IntelligenceFront);
}

function validSourceRef(value: unknown): value is IntelligenceSourceRef {
  if (!isRecord(value)) return false;
  return (
    isString(value.role) &&
    isString(value.title) &&
    (value.url === undefined || isString(value.url)) &&
    (value.ref === undefined || isString(value.ref)) &&
    isString(value.observedAt)
  );
}

function validSummary(value: unknown): value is IntelligenceArticleSummary {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    validFront(value.front) &&
    isString(value.slug) &&
    SAFE_SLUG.test(value.slug) &&
    isString(value.title) &&
    isString(value.dek) &&
    isString(value.publishedAt) &&
    isNumber(value.readingMinutes) &&
    value.readingMinutes > 0 &&
    value.readingMinutes <= 12 &&
    isString(value.articleRef) &&
    everyArray(value.professionalRefs, isString)
  );
}

function validSection(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isString(value.heading) && everyArray(value.body, isString) && value.body.length > 0;
}

export function parseIntelligenceEditorialSnapshot(
  value: unknown,
): IntelligenceEditorialSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 2 || value.readingDebt !== false) return null;

  const source = value.source;
  const current = value.current;
  const archive = value.archive;
  if (!isRecord(source) || !isRecord(current)) return null;

  const sourceValid =
    source.repository === 'franciscovitar/personal-ai-system' &&
    isString(source.ref) &&
    isString(source.commit) &&
    /^[a-f0-9]{40}$/.test(source.commit) &&
    source.canonicalCurrentRef === 'AI/editorial/INTELLIGENCE_EDITORIAL_CURRENT.json' &&
    source.canonicalArchiveRef === 'AI/editorial/INTELLIGENCE_EDITORIAL_ARCHIVE.json' &&
    isString(source.generatedAt) &&
    isString(source.observedAt) &&
    isNumber(source.staleAfterDays) &&
    source.staleAfterDays > 0;

  if (
    !sourceValid ||
    !FRONTS.every((front) => isString(current[front])) ||
    !everyArray(value.specials, isString) ||
    value.specials.length > 3 ||
    !everyArray(archive, validSummary) ||
    !isString(value.editorialNote)
  ) {
    return null;
  }

  const ids = new Set<string>();
  for (const item of archive) {
    if (ids.has(item.id)) return null;
    ids.add(item.id);
  }

  for (const front of FRONTS) {
    const id = current[front];
    if (!isString(id)) return null;
    const summary = archive.find((item) => item.id === id);
    if (!summary || summary.front !== front) return null;
  }

  const specialIds = new Set<string>();
  for (const id of value.specials) {
    if (specialIds.has(id) || !ids.has(id)) return null;
    specialIds.add(id);
  }

  return value as unknown as IntelligenceEditorialSnapshot;
}

export function parseIntelligenceArticle(value: unknown): IntelligenceArticle | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;

  const freshness = value.freshness;
  const source = value.source;
  if (!isRecord(freshness) || !isRecord(source)) return null;

  const valid =
    isString(value.articleId) &&
    validFront(value.front) &&
    isString(value.slug) &&
    SAFE_SLUG.test(value.slug) &&
    isString(value.title) &&
    isString(value.dek) &&
    isString(value.publishedAt) &&
    isNumber(value.readingMinutes) &&
    value.readingMinutes > 0 &&
    value.readingMinutes <= 12 &&
    value.format === 'ARTICLE' &&
    value.status === 'PUBLISHED' &&
    value.audienceAssumption === 'START_FROM_ZERO' &&
    isString(freshness.evidenceObservedAt) &&
    isString(freshness.reverifyAfter) &&
    isString(freshness.rule) &&
    Array.isArray(value.sections) &&
    value.sections.length > 0 &&
    value.sections.every(validSection) &&
    everyArray(value.sources, validSourceRef) &&
    everyArray(value.professionalRefs, isString) &&
    source.repository === 'franciscovitar/personal-ai-system' &&
    isString(source.ref) &&
    isString(source.commit) &&
    /^[a-f0-9]{40}$/.test(source.commit) &&
    isString(source.canonicalRef);

  return valid ? (value as unknown as IntelligenceArticle) : null;
}

export function isIntelligenceEditorialSnapshotStale(
  snapshot: IntelligenceEditorialSnapshot,
  now = new Date(),
): boolean {
  const observed = new Date(`${snapshot.source.observedAt}T00:00:00Z`);
  if (Number.isNaN(observed.getTime())) return true;
  const ageMs = Math.max(0, now.getTime() - observed.getTime());
  return ageMs > snapshot.source.staleAfterDays * 24 * 60 * 60 * 1000;
}

export function isIntelligenceArticleStale(
  article: IntelligenceArticle,
  now = new Date(),
): boolean {
  const reverify = new Date(`${article.freshness.reverifyAfter}T23:59:59Z`);
  return Number.isNaN(reverify.getTime()) || now.getTime() > reverify.getTime();
}

export function resolveIntelligenceEditorialSnapshotText(
  raw: string | null,
  now?: Date,
): IntelligenceEditorialData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'Inteligencia no está disponible: falta el índice editorial derivado.',
      stale: false,
      snapshot: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'invalid',
      notice: 'Inteligencia no está disponible: el índice editorial no es JSON válido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseIntelligenceEditorialSnapshot(parsed);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'Inteligencia no está disponible: el índice editorial no cumple el contrato V2.',
      stale: false,
      snapshot: null,
    };
  }

  const stale = isIntelligenceEditorialSnapshotStale(snapshot, now);
  return {
    status: 'ready',
    notice: stale
      ? 'El índice editorial está disponible, pero necesita refresh para representar el estado actual.'
      : null,
    stale,
    snapshot,
  };
}

export function resolveIntelligenceArticleText(
  raw: string | null,
  summary: IntelligenceArticleSummary,
  snapshot: IntelligenceEditorialSnapshot,
  now?: Date,
): IntelligenceArticleData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'El artículo no está disponible: falta su derivado editorial.',
      stale: false,
      summary,
      article: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'invalid',
      notice: 'El artículo no está disponible: su derivado no es JSON válido.',
      stale: false,
      summary,
      article: null,
    };
  }

  const article = parseIntelligenceArticle(parsed);
  if (
    !article ||
    article.articleId !== summary.id ||
    article.front !== summary.front ||
    article.slug !== summary.slug ||
    article.title !== summary.title ||
    article.source.commit !== snapshot.source.commit ||
    article.source.ref !== snapshot.source.ref ||
    article.source.canonicalRef !== summary.articleRef
  ) {
    return {
      status: 'invalid',
      notice: 'El artículo no está disponible: su contenido no coincide con el índice canónico.',
      stale: false,
      summary,
      article: null,
    };
  }

  const stale = isIntelligenceArticleStale(article, now);
  return {
    status: 'ready',
    notice: stale
      ? 'Este artículo queda en el archivo, pero sus afirmaciones rápidas necesitan revalidación antes de usarse como estado actual.'
      : null,
    stale,
    summary,
    article,
  };
}

export function findIntelligenceArticleForProfessionalRef(
  snapshot: IntelligenceEditorialSnapshot | null,
  ref: string,
): IntelligenceArticleSummary | null {
  if (!snapshot) return null;
  return snapshot.archive.find((item) => item.professionalRefs.includes(ref)) ?? null;
}

export function intelligenceArticleHref(summary: IntelligenceArticleSummary): string {
  return `/inteligencia/${summary.front}/${summary.slug}`;
}

export { FRONTS };
