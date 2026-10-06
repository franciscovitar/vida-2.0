import type {
  ProfessionalMarketDetailData,
  ProfessionalMarketDetailSnapshot,
} from '@/types/professional-market-detail';

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

function validRemoteSample(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.sample) &&
    isString(value.geography) &&
    isString(value.observedAt)
  );
}

function validRole(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.evidence)) return false;
  return (
    isString(value.id) &&
    isString(value.name) &&
    isNumber(value.evidence.demonstrated) &&
    isNumber(value.evidence.practiced) &&
    isString(value.personalVerificationStatus) &&
    isString(value.comparisonStatus) &&
    isStringArray(value.macroSignals) &&
    isStringArray(value.unresolved) &&
    Array.isArray(value.remoteSamples) &&
    value.remoteSamples.every(validRemoteSample)
  );
}

function validSkillSignal(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isString(value.signal) &&
    isString(value.geography) &&
    isString(value.period) &&
    isString(value.sourceLabel) &&
    isString(value.sourceUrl) &&
    value.sourceUrl.startsWith('https://')
  );
}

export function parseProfessionalMarketDetail(
  value: unknown,
): ProfessionalMarketDetailSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const source = value.source;
  const seniority = value.seniorityContext;
  if (
    !isRecord(source) ||
    source.repository !== 'franciscovitar/personal-ai-system' ||
    source.ref !== 'main' ||
    !isString(source.commit) ||
    !/^[a-f0-9]{40}$/.test(source.commit) ||
    !isString(source.generatedAt) ||
    !isString(source.observedAt) ||
    !isNumber(source.staleAfterDays) ||
    source.staleAfterDays <= 0 ||
    !isStringArray(source.canonicalRefs) ||
    !isString(value.status) ||
    !isString(value.rule) ||
    !isStringArray(value.targetRoleIds) ||
    !Array.isArray(value.roles) ||
    !value.roles.every(validRole) ||
    !Array.isArray(value.skillSignals) ||
    !value.skillSignals.every(validSkillSignal) ||
    !isRecord(seniority) ||
    !isString(seniority.geography) ||
    !isString(seniority.period) ||
    !isRecord(seniority.levels) ||
    !isString(seniority.levels.Junior) ||
    !isString(seniority.levels['Semi-Senior']) ||
    !isString(seniority.levels.Senior) ||
    !isString(seniority.sourceLabel) ||
    !isString(seniority.sourceUrl) ||
    !seniority.sourceUrl.startsWith('https://') ||
    !isString(seniority.note) ||
    !isStringArray(value.commonGaps)
  ) {
    return null;
  }

  const roleIds = new Set((value.roles as Array<{ id: string }>).map((role) => role.id));
  if (!(value.targetRoleIds as string[]).every((id) => roleIds.has(id))) return null;

  return value as unknown as ProfessionalMarketDetailSnapshot;
}

export function resolveProfessionalMarketDetailText(
  raw: string | null,
  now = new Date(),
): ProfessionalMarketDetailData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'El detalle de roles y skills de Mercado no está disponible.',
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
      notice: 'El detalle de roles y skills de Mercado tiene JSON inválido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseProfessionalMarketDetail(parsed);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'El detalle de roles y skills de Mercado no cumple el contrato.',
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
      ? 'El detalle de roles y skills necesita refresh antes de usarlo para una decisión laboral.'
      : null,
    stale,
    snapshot,
  };
}
