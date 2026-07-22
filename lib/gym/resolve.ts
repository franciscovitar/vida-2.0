/**
 * Resolución pura de la entrada canónica gym del Registro Web.
 */
import { canLoadWebCatalogContent } from '@/lib/web-catalog/policy';
import type { WebCatalogEntry } from '@/types/web-catalog';

export type GymCatalogResolveResult =
  | { ok: true; entry: WebCatalogEntry }
  | {
      ok: false;
      code: 'none' | 'ambiguous' | 'unauthorized' | 'hidden';
      message: string;
      count: number;
    };

/** Entradas con renderMode gym (sin filtrar política). */
export function listGymRenderModeEntries(
  entries: readonly WebCatalogEntry[],
): readonly WebCatalogEntry[] {
  return entries.filter((entry) => entry.renderMode === 'gym');
}

/**
 * Exactamente una entrada canónica autorizada con renderMode=gym.
 * No identifica por título.
 */
export function resolveCanonicalGymEntry(
  entries: readonly WebCatalogEntry[],
): GymCatalogResolveResult {
  const gymEntries = listGymRenderModeEntries(entries);
  if (gymEntries.length === 0) {
    return {
      ok: false,
      code: 'none',
      message: 'No hay una rutina de Gimnasio en el Registro Web.',
      count: 0,
    };
  }

  const authorized = gymEntries.filter((entry) => canLoadWebCatalogContent(entry));
  if (authorized.length === 1) {
    return { ok: true, entry: authorized[0]! };
  }
  if (authorized.length > 1) {
    return {
      ok: false,
      code: 'ambiguous',
      message: 'Hay varias rutinas canónicas de Gimnasio; no se puede resolver de forma segura.',
      count: authorized.length,
    };
  }

  const anyHidden = gymEntries.some(
    (entry) => entry.status === 'hidden' || !entry.policy.visibleWeb,
  );
  if (anyHidden || gymEntries.every((entry) => entry.status !== 'published')) {
    return {
      ok: false,
      code: 'hidden',
      message: 'La rutina de Gimnasio no está publicada o visible en la web.',
      count: gymEntries.length,
    };
  }

  return {
    ok: false,
    code: 'unauthorized',
    message: 'La rutina de Gimnasio no está autorizada para lectura web.',
    count: gymEntries.length,
  };
}
