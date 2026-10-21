/** Read-only, privacy-minimal projection of owner-curated achievement ledger rows.
 * This module does NOT authenticate sources or accept LLM claims as trusted.
 * The future authenticated writer owns ACCEPTED provenance and eventKey checks.
 */
export type AchievementCategory = 'ACADEMIC' | 'PROJECT' | 'PROFESSIONAL' | 'PERSONAL' | 'OTHER';
export type AchievementState = 'not-configured' | 'unavailable' | 'empty' | 'ready' | 'degraded';

export type AchievementCard = Readonly<{
  title: string;
  occurredOn: string | null;
  category: AchievementCategory;
  evidenceLabel: string;
}>;
export type AchievementsView = Readonly<{
  state: AchievementState;
  items: readonly AchievementCard[];
}>;
export type NotionAchievementPage = Readonly<{ properties: Record<string, unknown> }>;

const CATEGORY = new Set<AchievementCategory>([
  'ACADEMIC', 'PROJECT', 'PROFESSIONAL', 'PERSONAL', 'OTHER',
]);
const EVENT_KEY = /^[a-z0-9]+(?::[a-z0-9_-]+){2,6}$/;
const PRIVATE_TEXT = /(?:-----BEGIN [A-Z ]*PRIVATE KEY|\b(?:password|token|api[_ -]?key|secret[_ -]?key)\s*[:=]|\bsk-[a-z0-9_-]{12,}|\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b)/i;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function selection(value: unknown): string | null {
  const property = record(value);
  const selected = record(property?.select);
  return selected && typeof selected.name === 'string' ? selected.name : null;
}

function textArray(value: unknown, kind: 'title' | 'rich_text', maxLength: number): string | null {
  const property = record(value);
  const items = property?.[kind];
  if (!Array.isArray(items) || items.length < 1 || items.length > 6) return null;
  const text = items.map((item) => record(item)?.plain_text);
  if (text.some((chunk) => typeof chunk !== 'string')) return null;
  const result = (text as string[]).join('').trim();
  if (!result || result.length > maxLength || /[\r\n]/.test(result) || PRIVATE_TEXT.test(result)) {
    return null;
  }
  return result;
}

function civilDate(value: unknown): string | null | undefined {
  const property = record(value);
  if (!property || property.date === null) return null;
  const start = record(property.date)?.start;
  if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return undefined;
  const date = new Date(start + 'T00:00:00Z');
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== start
    ? undefined
    : start;
}

type Parsed = { eventKey: string; card: AchievementCard };
function parseAccepted(page: NotionAchievementPage): Parsed | null {
  const p = page.properties;
  if (selection(p.Estado) !== 'ACCEPTED' || selection(p.Sensibilidad) !== 'STANDARD') return null;
  const title = textArray(p.Nombre, 'title', 180);
  const eventKey = textArray(p.ClaveEvento, 'rich_text', 128);
  const category = selection(p.Categoria);
  const assertion = selection(p.Asercion);
  const occurredOn = civilDate(p.Fecha);
  const confirmed = record(p.RegistroAutorizado)?.checkbox;
  if (!title || !eventKey || !EVENT_KEY.test(eventKey) || !category ||
      !CATEGORY.has(category as AchievementCategory) || occurredOn === undefined || confirmed !== true ||
      !['SELF_REPORTED', 'OWNER_VERIFIED'].includes(assertion ?? '')) {
    return null;
  }
  return {
    eventKey,
    card: {
      title,
      occurredOn,
      category: category as AchievementCategory,
      evidenceLabel: assertion === 'OWNER_VERIFIED'
        ? 'Marcado como verificado en Logros'
        : 'Declarado y aceptado por vos',
    },
  };
}

/** Caller only passes pages from an explicitly allowlisted private Notion data source. */
export function buildAchievementsView(
  pages: readonly NotionAchievementPage[],
  options: { hasMore?: boolean } = {},
): AchievementsView {
  const byKey = new Map<string, AchievementCard>();
  const duplicates = new Set<string>();
  let degraded = options.hasMore === true;
  for (const page of pages) {
    // Unaccepted proposals are never visible, even if they contain valid titles.
    if (selection(page.properties.Estado) !== 'ACCEPTED') continue;
    const parsed = parseAccepted(page);
    if (!parsed) {
      degraded = true;
      continue;
    }
    if (byKey.has(parsed.eventKey)) {
      duplicates.add(parsed.eventKey);
      degraded = true;
      continue;
    }
    byKey.set(parsed.eventKey, parsed.card);
  }
  for (const key of duplicates) byKey.delete(key); // fail closed on ambiguous event identity
  const items = [...byKey.values()]
    .sort((a, b) => (b.occurredOn ?? '').localeCompare(a.occurredOn ?? '') ||
      a.title.localeCompare(b.title))
    .slice(0, 30);
  return { state: degraded ? 'degraded' : items.length ? 'ready' : 'empty', items };
}
