import 'server-only';

import {
  mdblistIdentityMatches,
  mediumFromMediaPublicKey,
  normalizeMdblistRatings,
  resolveExternalRatingsTarget,
  type MediaExternalRatingsView,
} from '@/lib/media/external-ratings';
import { readMediaTabValues } from '@/lib/media/sheets-read';

export type ExternalRatingsFetchCode =
  | 'invalid-key'
  | 'not-configured'
  | 'sheet-unavailable'
  | 'missing-header'
  | 'not-found'
  | 'conflict'
  | 'missing-identity'
  | 'provider-auth'
  | 'provider-limit'
  | 'provider-not-found'
  | 'provider-error';

export type ExternalRatingsFetchResult =
  { ok: true; data: MediaExternalRatingsView } | { ok: false; code: ExternalRatingsFetchCode };

const MDBLIST_BASE = 'https://api.mdblist.com';
const MDBLIST_REVALIDATE_SECONDS = 6 * 60 * 60;

function providerType(medium: 'movie' | 'series'): 'movie' | 'show' {
  return medium === 'movie' ? 'movie' : 'show';
}

function providerUrl(
  target: {
    medium: 'movie' | 'series';
    imdbId: string | null;
    tmdbId: number | null;
  },
  apiKey: string,
): string | null {
  const kind = providerType(target.medium);
  if (target.imdbId) {
    return `${MDBLIST_BASE}/imdb/${kind}/${encodeURIComponent(target.imdbId)}?apikey=${encodeURIComponent(apiKey)}`;
  }
  if (target.tmdbId !== null) {
    return `${MDBLIST_BASE}/tmdb/${kind}/${target.tmdbId}?apikey=${encodeURIComponent(apiKey)}`;
  }
  return null;
}

export async function loadExternalRatings(
  publicKey: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ExternalRatingsFetchResult> {
  const key = publicKey.trim();
  const medium = mediumFromMediaPublicKey(key);
  if (!medium || !key || key.length > 512) return { ok: false, code: 'invalid-key' };

  const apiKey = env.MDBLIST_API_KEY?.trim();
  if (!apiKey) return { ok: false, code: 'not-configured' };

  const tab = medium === 'movie' ? 'Movies' : 'Series';
  const snapshot = await readMediaTabValues(tab, env);
  if (!snapshot.ok) return { ok: false, code: 'sheet-unavailable' };

  const resolved = resolveExternalRatingsTarget(snapshot.values, medium, key);
  if (!resolved.ok) return { ok: false, code: resolved.code };

  const url = providerUrl(resolved.target, apiKey);
  if (!url) return { ok: false, code: 'missing-identity' };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      next: { revalidate: MDBLIST_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, code: 'provider-error' };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, code: 'provider-auth' };
  }
  if (response.status === 429) return { ok: false, code: 'provider-limit' };
  if (response.status === 404) return { ok: false, code: 'provider-not-found' };
  if (!response.ok) return { ok: false, code: 'provider-error' };

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    return { ok: false, code: 'provider-error' };
  }

  if (!mdblistIdentityMatches(payload, resolved.target)) {
    return { ok: false, code: 'conflict' };
  }

  return { ok: true, data: normalizeMdblistRatings(payload) };
}
