import type { SheetReadCode } from '@/lib/google/errors';
import { parseMediaTab } from '@/lib/media/parse';
import { readMediaTabValues, type MediaTab } from '@/lib/media/sheets-read';
import type {
  MediaDashboardData,
  MediaKind,
  MediaSourceState,
  MediaSourceView,
  MediaTitleView,
} from '@/types/media';

interface LoadedSource {
  source: MediaSourceView;
  titles: MediaTitleView[];
}

const LABEL: Record<MediaKind, string> = {
  movie: 'Películas',
  series: 'Series',
};

function mediumFor(tab: MediaTab): MediaKind {
  return tab === 'Movies' ? 'movie' : 'series';
}

function noticeFor(medium: MediaKind, state: MediaSourceState): string {
  const label = LABEL[medium];
  if (state === 'not-configured') return `${label}: falta configurar la fuente de Media.`;
  if (state === 'auth-error') return `${label}: no se pudo autenticar la lectura de Google Sheets.`;
  if (state === 'permission-error') {
    return `${label}: la cuenta de servicio no tiene permiso de lectura.`;
  }
  if (state === 'missing-tab') return `${label}: no se encontró la pestaña canónica esperada.`;
  if (state === 'missing-header') {
    return `${label}: la estructura del Sheet no coincide con el contrato.`;
  }
  if (state === 'read-error') return `${label}: Google Sheets no respondió correctamente.`;
  return `${label}: fuente disponible.`;
}

async function loadSource(tab: MediaTab): Promise<LoadedSource> {
  const medium = mediumFor(tab);
  const read = await readMediaTabValues(tab);
  if (!read.ok) {
    return {
      source: { medium, state: read.code, notice: noticeFor(medium, read.code) },
      titles: [],
    };
  }

  const parsed = parseMediaTab(tab, read.values);
  if (!parsed.ok) {
    return {
      source: {
        medium,
        state: 'missing-header',
        notice: noticeFor(medium, 'missing-header'),
      },
      titles: [],
    };
  }

  return {
    source: { medium, state: 'ready', notice: null },
    titles: parsed.titles,
  };
}

export async function loadMediaDashboard(): Promise<MediaDashboardData> {
  const [movies, series] = await Promise.all([loadSource('Movies'), loadSource('Series')]);
  const sources = [movies.source, series.source];
  const titles = [...movies.titles, ...series.titles];
  const readyCount = sources.filter((source) => source.state === 'ready').length;

  if (readyCount === sources.length) {
    return { status: 'ready', notice: null, titles, sources };
  }

  if (readyCount > 0) {
    return {
      status: 'partial',
      notice:
        'Media está parcialmente disponible. La fuente con error no se reemplaza por datos simulados.',
      titles,
      sources,
    };
  }

  const states = new Set<SheetReadCode | 'missing-header'>(
    sources.map((source) => source.state as SheetReadCode | 'missing-header'),
  );
  const notConfigured = states.size === 1 && states.has('not-configured');

  return {
    status: 'unavailable',
    notice: notConfigured
      ? 'Media todavía no está configurado en este entorno.'
      : 'No se pudo leer la fuente canónica de Media. No se muestran datos simulados.',
    titles: [],
    sources,
  };
}
