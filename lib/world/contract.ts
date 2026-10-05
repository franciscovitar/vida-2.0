import type {
  WorldDomain,
  WorldPieceData,
  WorldPieceSummary,
  WorldPublishedPiece,
  WorldSurfaceData,
  WorldSurfaceSnapshot,
} from '@/types/world-intelligence';

export const WORLD_DOMAINS: readonly {
  id: WorldDomain;
  slug: string;
  label: string;
}[] = [
  {
    id: 'POLITICS_GEOPOLITICS',
    slug: 'politica-geopolitica',
    label: 'Política & Geopolítica',
  },
  { id: 'ECONOMICS', slug: 'economia', label: 'Economía' },
  { id: 'SCIENCE', slug: 'ciencia', label: 'Ciencia' },
  { id: 'PSYCHOLOGY_BEHAVIOR', slug: 'psicologia', label: 'Psicología' },
  { id: 'HEALTH', slug: 'salud', label: 'Salud' },
  { id: 'TECH_AI', slug: 'tecnologia-ia', label: 'Tecnología & IA' },
  {
    id: 'HISTORY_CULTURE',
    slug: 'historia-cultura',
    label: 'Historia & Cultura',
  },
  {
    id: 'PRODUCTIVITY_HABITS',
    slug: 'productividad-habitos',
    label: 'Productividad & Hábitos',
  },
];

const DOMAIN_SET = new Set<WorldDomain>(WORLD_DOMAINS.map((item) => item.id));
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validDomain(value: unknown): value is WorldDomain {
  return typeof value === 'string' && DOMAIN_SET.has(value as WorldDomain);
}

function validPublicationState(value: unknown): boolean {
  return value === 'HUMAN_APPROVED' || value === 'OWNER_AUTHORIZED_AUTOMATION';
}

function hasAuthorizationRef(value: Record<string, unknown>): boolean {
  return isString(value.humanReviewRef) || isString(value.authorizationRef);
}

function validSummary(value: unknown, mode?: 'NOW' | 'LEARN'): value is WorldPieceSummary {
  if (!isRecord(value)) return false;
  if (value.mode !== 'NOW' && value.mode !== 'LEARN') return false;
  if (mode && value.mode !== mode) return false;

  return (
    isString(value.briefId) &&
    isString(value.slug) &&
    SAFE_SLUG.test(value.slug) &&
    validDomain(value.primaryDomain) &&
    isString(value.headline) &&
    isString(value.deck) &&
    isNumber(value.readingSeconds) &&
    value.readingSeconds > 0 &&
    isString(value.pieceRef) &&
    hasAuthorizationRef(value) &&
    isString(value.editorialDraftSha256) &&
    SHA256.test(value.editorialDraftSha256) &&
    (value.sourceCommit === undefined ||
      (isString(value.sourceCommit) && GIT_SHA.test(value.sourceCommit))) &&
    validPublicationState(value.publicationState)
  );
}

function allItems(snapshot: WorldSurfaceSnapshot): readonly WorldPieceSummary[] {
  return [...snapshot.now.items, ...snapshot.learn.items];
}

export function parseWorldSurfaceSnapshot(value: unknown): WorldSurfaceSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.kind !== 'world_vida_surface') {
    return null;
  }

  if (
    value.readingDebt !== false ||
    !isRecord(value.source) ||
    !isRecord(value.now) ||
    !isRecord(value.learn) ||
    !isRecord(value.library)
  ) {
    return null;
  }

  const source = value.source;
  if (
    source.repository !== 'franciscovitar/personal-ai-system' ||
    !isString(source.ref) ||
    !isString(source.commit) ||
    !GIT_SHA.test(source.commit) ||
    source.canonicalSurfaceRef !==
      'AI/projects/world-intelligence/fixtures/PUBLISHED_SURFACE_V1.json' ||
    !isString(source.generatedAt) ||
    !isString(source.observedAt) ||
    !isNumber(source.staleAfterHours) ||
    source.staleAfterHours <= 0
  ) {
    return null;
  }

  const nowItems = value.now.items;
  const learnItems = value.learn.items;
  const libraryItems = value.library.items;
  if (
    !Array.isArray(nowItems) ||
    !nowItems.every((item) => validSummary(item, 'NOW')) ||
    !Array.isArray(learnItems) ||
    !learnItems.every((item) => validSummary(item, 'LEARN')) ||
    !Array.isArray(libraryItems) ||
    !libraryItems.every((item) => validSummary(item)) ||
    !isNumber(value.now.targetReadingSeconds) ||
    !isNumber(value.now.selectedReadingSeconds) ||
    !isString(value.editionDate) ||
    (value.freshnessState !== 'CURRENT' && value.freshnessState !== 'STALE') ||
    !isString(value.provenanceVersion) ||
    !Array.isArray(value.coverageNotes) ||
    !value.coverageNotes.every(isString) ||
    !Array.isArray(value.domains)
  ) {
    return null;
  }

  const snapshot = value as unknown as WorldSurfaceSnapshot;
  const items = allItems(snapshot);
  const ids = new Set<string>();
  const slugs = new Set<string>();

  for (const item of items) {
    if (ids.has(item.briefId) || slugs.has(item.slug)) return null;
    ids.add(item.briefId);
    slugs.add(item.slug);
  }

  const libraryIds = new Set<string>();
  const librarySlugs = new Set<string>();
  for (const item of snapshot.library.items) {
    if (libraryIds.has(item.briefId) || librarySlugs.has(item.slug)) return null;
    libraryIds.add(item.briefId);
    librarySlugs.add(item.slug);
  }

  for (const item of items) {
    const archived = snapshot.library.items.find((candidate) => candidate.briefId === item.briefId);
    if (
      !archived ||
      archived.slug !== item.slug ||
      archived.editorialDraftSha256 !== item.editorialDraftSha256
    ) {
      return null;
    }
  }

  const selected = snapshot.now.items.reduce((sum, item) => sum + item.readingSeconds, 0);
  if (
    selected !== snapshot.now.selectedReadingSeconds ||
    selected > snapshot.now.targetReadingSeconds
  ) {
    return null;
  }

  if (snapshot.domains.length !== WORLD_DOMAINS.length) return null;

  for (const meta of WORLD_DOMAINS) {
    const domain = snapshot.domains.find((item) => item.id === meta.id);
    if (!domain || domain.label !== meta.label) return null;

    const actual = items.filter((item) => item.primaryDomain === meta.id).length;
    if (domain.publishedItems !== actual) return null;
  }

  return snapshot;
}

function validBackground(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    isString(value.backgroundRef) &&
    isString(value.term) &&
    isString(value.plainLanguageDefinition) &&
    isString(value.sourceId) &&
    isString(value.sourceRole) &&
    isString(value.sourceUrl)
  );
}

function validBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    isString(value.kind) &&
    typeof value.material === 'boolean' &&
    isString(value.text) &&
    Array.isArray(value.claimRefs) &&
    value.claimRefs.every(isString) &&
    Array.isArray(value.backgroundRefs) &&
    value.backgroundRefs.every(isString)
  );
}

function validSection(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    isString(value.id) &&
    typeof value.title === 'string' &&
    Array.isArray(value.blocks) &&
    value.blocks.length > 0 &&
    value.blocks.every(validBlock)
  );
}

function validSourceNote(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    isString(value.sourceId) &&
    isString(value.role) &&
    (value.publisher === undefined || isString(value.publisher))
  );
}

export function parseWorldPublishedPiece(value: unknown): WorldPublishedPiece | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'world_published_piece' ||
    !validPublicationState(value.publicationState) ||
    (value.mode !== 'NOW' && value.mode !== 'LEARN')
  ) {
    return null;
  }

  if (
    !isString(value.briefId) ||
    !isString(value.slug) ||
    !SAFE_SLUG.test(value.slug) ||
    !validDomain(value.primaryDomain) ||
    !Array.isArray(value.secondaryDomains) ||
    !value.secondaryDomains.every(validDomain) ||
    !isString(value.headline) ||
    !isString(value.deck) ||
    !isNumber(value.readingSeconds) ||
    value.readingSeconds <= 0 ||
    !isString(value.publishedAt) ||
    !isString(value.editorialDraftSha256) ||
    !SHA256.test(value.editorialDraftSha256) ||
    !Array.isArray(value.backgroundNotes) ||
    !value.backgroundNotes.every(validBackground) ||
    !Array.isArray(value.sections) ||
    value.sections.length === 0 ||
    !value.sections.every(validSection) ||
    !Array.isArray(value.sourceNotes) ||
    !value.sourceNotes.every(validSourceNote) ||
    !isRecord(value.source)
  ) {
    return null;
  }

  const source = value.source;
  if (
    source.repository !== 'franciscovitar/personal-ai-system' ||
    !isString(source.ref) ||
    !isString(source.commit) ||
    !GIT_SHA.test(source.commit) ||
    !isString(source.canonicalRef) ||
    !isString(source.editorialDraftRef) ||
    !hasAuthorizationRef(source)
  ) {
    return null;
  }

  return value as unknown as WorldPublishedPiece;
}

export function isWorldSurfaceStale(snapshot: WorldSurfaceSnapshot, now = new Date()): boolean {
  const generated = new Date(snapshot.source.generatedAt);
  if (Number.isNaN(generated.getTime())) return true;

  return now.getTime() - generated.getTime() > snapshot.source.staleAfterHours * 60 * 60 * 1000;
}

export function resolveWorldSurfaceText(raw: string | null, now?: Date): WorldSurfaceData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'World no está disponible: falta la superficie publicada derivada.',
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
      notice: 'World no está disponible: la superficie publicada no es JSON válido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseWorldSurfaceSnapshot(parsed);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'World no está disponible: la superficie derivada no cumple el contrato V1.',
      stale: false,
      snapshot: null,
    };
  }

  const stale = snapshot.freshnessState === 'STALE' || isWorldSurfaceStale(snapshot, now);
  return {
    status: 'ready',
    notice: stale
      ? 'Esta edición sigue disponible, pero está marcada como desactualizada. No se presenta como estado fresco del mundo.'
      : null,
    stale,
    snapshot,
  };
}

export function resolveWorldPieceText(
  raw: string | null,
  summary: WorldPieceSummary,
  snapshot: WorldSurfaceSnapshot,
  now?: Date,
): WorldPieceData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'La pieza no está disponible: falta su derivado publicado.',
      stale: false,
      summary,
      piece: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'invalid',
      notice: 'La pieza no está disponible: su derivado no es JSON válido.',
      stale: false,
      summary,
      piece: null,
    };
  }

  const piece = parseWorldPublishedPiece(parsed);
  if (
    !piece ||
    piece.briefId !== summary.briefId ||
    piece.mode !== summary.mode ||
    piece.slug !== summary.slug ||
    piece.primaryDomain !== summary.primaryDomain ||
    piece.headline !== summary.headline ||
    piece.deck !== summary.deck ||
    piece.readingSeconds !== summary.readingSeconds ||
    piece.editorialDraftSha256 !== summary.editorialDraftSha256 ||
    piece.source.commit !== (summary.sourceCommit ?? snapshot.source.commit) ||
    piece.source.ref !== snapshot.source.ref ||
    piece.source.canonicalRef !== summary.pieceRef
  ) {
    return {
      status: 'invalid',
      notice: 'La pieza no está disponible: su contenido no coincide con la superficie canónica.',
      stale: false,
      summary,
      piece: null,
    };
  }

  const historical =
    summary.sourceCommit !== undefined && summary.sourceCommit !== snapshot.source.commit;
  const stale = isWorldSurfaceStale(snapshot, now) || historical;
  return {
    status: 'ready',
    notice:
      stale && piece.mode === 'NOW'
        ? historical
          ? 'Esta pieza pertenece a una edición anterior; conserva valor histórico, pero no debe leerse como estado fresco.'
          : 'Esta pieza actual pertenece a una edición desactualizada; conserva valor histórico, pero no debe leerse como estado fresco.'
        : null,
    stale: stale && piece.mode === 'NOW',
    summary,
    piece,
  };
}

export function worldPieceHref(item: WorldPieceSummary): string {
  return `/world/pieza/${item.slug}`;
}

export function worldDomainHref(domain: WorldDomain): string {
  const meta = WORLD_DOMAINS.find((item) => item.id === domain);
  return meta ? `/world/tema/${meta.slug}` : '/world';
}

export function worldDomainFromSlug(slug: string): WorldDomain | null {
  return WORLD_DOMAINS.find((item) => item.slug === slug)?.id ?? null;
}

export function worldDomainLabel(domain: WorldDomain): string {
  return WORLD_DOMAINS.find((item) => item.id === domain)?.label ?? domain;
}

export function listWorldItems(snapshot: WorldSurfaceSnapshot): readonly WorldPieceSummary[] {
  return snapshot.library.items;
}
