import type {
  ProfessionalOfferAccessClass,
  ProfessionalOfferComparisonGroup,
  ProfessionalOfferRankingStatus,
  ProfessionalOfferVariant,
  ProfessionalOfferVariantsData,
  ProfessionalOfferVariantsSnapshot,
} from '@/types/professional-offers';

const ACCESS = new Set<ProfessionalOfferAccessClass>([
  'FREE',
  'FREEMIUM',
  'PAID',
  'OPEN_SOURCE',
  'USAGE_BASED',
]);

const RANKING = new Set<ProfessionalOfferRankingStatus>(['COMPARISON_ONLY', 'RANKED']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function validOffer(value: unknown): value is ProfessionalOfferVariant {
  if (!isRecord(value)) return false;
  if (
    !isString(value.id) ||
    !isString(value.provider) ||
    !isString(value.product) ||
    !isString(value.plan) ||
    !isStringArray(value.channels) ||
    typeof value.accessClass !== 'string' ||
    !ACCESS.has(value.accessClass as ProfessionalOfferAccessClass) ||
    !isNumber(value.headlinePriceUsdMonthly) ||
    !isString(value.keyLimit) ||
    value.keyLimit.length < 20 ||
    !isString(value.limitExactness) ||
    !isString(value.resetCadence) ||
    !isStringArray(value.included) ||
    !isStringArray(value.excludedOrCapped) ||
    !isString(value.sustainedUseFit) ||
    !isStringArray(value.officialSources) ||
    value.officialSources.length < 1 ||
    !value.officialSources.every((url) => url.startsWith('https://')) ||
    !isString(value.lastVerified)
  ) {
    return false;
  }

  if (value.accessClass === 'FREE' && value.headlinePriceUsdMonthly !== 0) return false;
  return true;
}

function validGroup(value: unknown): value is ProfessionalOfferComparisonGroup {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.label) &&
    isString(value.taskFamily) &&
    typeof value.rankingStatus === 'string' &&
    RANKING.has(value.rankingStatus as ProfessionalOfferRankingStatus) &&
    isString(value.rankingReason) &&
    isStringArray(value.offerIds) &&
    value.offerIds.length > 0
  );
}

export function parseProfessionalOfferVariants(
  value: unknown,
): ProfessionalOfferVariantsSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;

  const source = value.source;
  if (
    !isRecord(source) ||
    source.repository !== 'franciscovitar/personal-ai-system' ||
    !isString(source.ref) ||
    !isString(source.commit) ||
    !/^[a-f0-9]{40}$/.test(source.commit) ||
    !isString(source.canonicalRef) ||
    !isString(source.generatedAt) ||
    !isString(source.observedAt) ||
    !isNumber(source.staleAfterDays) ||
    source.staleAfterDays <= 0 ||
    !isString(value.status) ||
    !isStringArray(value.notes) ||
    !Array.isArray(value.comparisonGroups) ||
    !value.comparisonGroups.every(validGroup) ||
    !Array.isArray(value.offers) ||
    !value.offers.every(validOffer)
  ) {
    return null;
  }

  const offers = value.offers as ProfessionalOfferVariant[];
  const ids = offers.map((offer) => offer.id);
  if (new Set(ids).size !== ids.length) return null;

  const idSet = new Set(ids);
  for (const group of value.comparisonGroups as ProfessionalOfferComparisonGroup[]) {
    if (new Set(group.offerIds).size !== group.offerIds.length) return null;
    if (!group.offerIds.every((id) => idSet.has(id))) return null;
  }

  const productPlanCounts = new Map<string, Set<string>>();
  for (const offer of offers) {
    const key = `${offer.provider}::${offer.product}`;
    const plans = productPlanCounts.get(key) ?? new Set<string>();
    plans.add(offer.plan);
    productPlanCounts.set(key, plans);
  }
  if (![...productPlanCounts.values()].some((plans) => plans.size > 1)) return null;

  return value as unknown as ProfessionalOfferVariantsSnapshot;
}

export function resolveProfessionalOfferVariantsText(
  raw: string | null,
  now = new Date(),
): ProfessionalOfferVariantsData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'El comparador de planes no está disponible.',
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
      notice: 'El comparador de planes no está disponible: JSON inválido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseProfessionalOfferVariants(parsed);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'El comparador de planes no cumple el contrato.',
      stale: false,
      snapshot: null,
    };
  }

  const observed = new Date(`${snapshot.source.observedAt}T00:00:00Z`);
  const stale =
    Number.isNaN(observed.getTime()) ||
    Math.max(0, now.getTime() - observed.getTime()) >
      snapshot.source.staleAfterDays * 24 * 60 * 60 * 1000;

  return {
    status: 'ready',
    notice: stale
      ? 'Precios y límites disponibles, pero necesitan revalidación antes de una compra o cambio de plan.'
      : null,
    stale,
    snapshot,
  };
}
