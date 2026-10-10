import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  isVisualSourceReviewDue,
  parseProfessionalVisualizationSnapshot,
  type ProfessionalVisualizationSnapshot,
} from '@/lib/professional/visualization-contract';

export interface ProfessionalVisualizationData {
  status: 'ready' | 'missing' | 'invalid';
  notice: string | null;
  stale: boolean;
  snapshot: ProfessionalVisualizationSnapshot | null;
}

const DERIVATIVE_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'professional-visualization.json',
);

export function resolveProfessionalVisualizationText(
  raw: string | null,
  now = new Date(),
): ProfessionalVisualizationData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'Los gráficos todavía no tienen evidencia verificada disponible.',
      stale: false,
      snapshot: null,
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      status: 'invalid',
      notice: 'Los gráficos se ocultaron: el archivo de datos es inválido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseProfessionalVisualizationSnapshot(value);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'Los gráficos se ocultaron: los datos no cumplen el contrato de evidencia.',
      stale: false,
      snapshot: null,
    };
  }

  const stale = snapshot.sources.some((source) => isVisualSourceReviewDue(source, now));

  return {
    status: 'ready',
    notice: stale
      ? 'Esta referencia necesita verificación actualizada antes de utilizarla para decisiones.'
      : null,
    stale,
    snapshot,
  };
}

export async function loadProfessionalVisualization(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<ProfessionalVisualizationData> {
  const readText = options?.readText ?? (() => readFile(DERIVATIVE_PATH, 'utf8'));
  try {
    return resolveProfessionalVisualizationText(await readText(), options?.now);
  } catch {
    return resolveProfessionalVisualizationText(null, options?.now);
  }
}
