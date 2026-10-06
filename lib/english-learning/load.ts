import 'server-only';

import { cache } from 'react';

import snapshotProfile from './profile.snapshot.json';
import type { EnglishLearnerProfile, EnglishProfileLoadResult } from './types';

const DEFAULT_REPOSITORY = 'franciscovitar/personal-ai-system';
const DEFAULT_PATH = 'AI/projects/english-speaking-lab/state/learner_profile.json';
const DEFAULT_REF = 'main';

type GithubContentsResponse = {
  content?: string;
  encoding?: string;
};

function isProfile(value: unknown): value is EnglishLearnerProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EnglishLearnerProfile>;
  return (
    candidate.schema_version === 1 &&
    candidate.project_id === 'english-speaking-lab' &&
    (candidate.baseline_status === 'collecting' || candidate.baseline_status === 'ready') &&
    typeof candidate.summary === 'string' &&
    typeof candidate.updated === 'string' &&
    Boolean(candidate.dimensions && typeof candidate.dimensions === 'object') &&
    Array.isArray(candidate.strengths) &&
    Array.isArray(candidate.recurring_weaknesses) &&
    Array.isArray(candidate.pronunciation_targets) &&
    Array.isArray(candidate.vocabulary) &&
    Array.isArray(candidate.current_priorities) &&
    Array.isArray(candidate.quests) &&
    Array.isArray(candidate.achievements) &&
    Boolean(candidate.coverage && typeof candidate.coverage === 'object')
  );
}

function decodeGithubContent(payload: GithubContentsResponse): unknown {
  if (payload.encoding !== 'base64' || !payload.content) {
    throw new Error('Unsupported GitHub contents response');
  }

  const json = Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8');
  return JSON.parse(json) as unknown;
}

function loadFromSnapshot(): EnglishProfileLoadResult {
  const raw: unknown = snapshotProfile;

  if (!isProfile(raw)) {
    return {
      state: 'invalid',
      profile: null,
      notice: 'La proyección versionada de English Speaking Lab no cumple el contrato esperado.',
    };
  }

  return {
    state: 'ready',
    profile: raw,
    notice: `Proyección read-only actualizada al ${raw.updated}. GitHub canónico sigue siendo la fuente de verdad.`,
  };
}

async function loadFromGithub(): Promise<EnglishProfileLoadResult> {
  const token = process.env.ENGLISH_PROFILE_GITHUB_TOKEN?.trim();
  if (!token) {
    return {
      state: 'unconfigured',
      profile: null,
      notice:
        'La lectura remota de GitHub no tiene credencial configurada; se usará la última proyección versionada si está disponible.',
    };
  }

  const repository = process.env.ENGLISH_PROFILE_GITHUB_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const path = process.env.ENGLISH_PROFILE_GITHUB_PATH?.trim() || DEFAULT_PATH;
  const ref = process.env.ENGLISH_PROFILE_GITHUB_REF?.trim() || DEFAULT_REF;
  const url = `https://api.github.com/repos/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        state: 'unavailable',
        profile: null,
        notice: 'No se pudo leer el learner profile canónico en este momento.',
      };
    }

    const raw = decodeGithubContent((await response.json()) as GithubContentsResponse);
    if (!isProfile(raw)) {
      return {
        state: 'invalid',
        profile: null,
        notice: 'El learner profile existe, pero no cumple el contrato esperado por Vida 2.0.',
      };
    }

    return {
      state: 'ready',
      profile: raw,
      notice:
        raw.baseline_status === 'collecting'
          ? 'Baseline en construcción: Vida muestra solo evidencia confirmada y deja el resto sin inferir.'
          : 'Perfil leído desde el estado canónico de English Speaking Lab.',
    };
  } catch {
    return {
      state: 'unavailable',
      profile: null,
      notice: 'No se pudo leer el learner profile canónico en este momento.',
    };
  }
}

export const loadEnglishLearnerProfile = cache(async (): Promise<EnglishProfileLoadResult> => {
  const source = process.env.ENGLISH_PROFILE_DATA_SOURCE?.trim() || 'snapshot';

  if (source === 'github') {
    const remote = await loadFromGithub();
    if (remote.profile) return remote;

    const fallback = loadFromSnapshot();
    if (fallback.profile) {
      return {
        ...fallback,
        notice: `${remote.notice} Mostrando la última proyección versionada (${fallback.profile.updated}).`,
      };
    }

    return remote;
  }

  // "disabled" was the original production default. Keep it backward-compatible:
  // remote GitHub access may remain disabled while the private, versioned projection is still usable.
  if (source === 'snapshot' || source === 'disabled') {
    return loadFromSnapshot();
  }

  return {
    state: 'invalid',
    profile: null,
    notice: 'ENGLISH_PROFILE_DATA_SOURCE tiene un valor no permitido.',
  };
});
