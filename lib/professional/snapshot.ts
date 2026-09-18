import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  isProfessionalSnapshotStale,
  parseProfessionalSnapshot,
} from '@/lib/professional/contract';
import type { ProfessionalIntelligenceData } from '@/types/professional-intelligence';

const SNAPSHOT_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'professional-snapshot.json',
);

export async function loadProfessionalSnapshot(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<ProfessionalIntelligenceData> {
  const readText = options?.readText ?? (() => readFile(SNAPSHOT_PATH, 'utf8'));

  let raw: string;
  try {
    raw = await readText();
  } catch {
    return {
      status: 'missing',
      notice: 'Professional Intelligence no está disponible: falta el snapshot derivado.',
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
      notice: 'Professional Intelligence no está disponible: el snapshot no es JSON válido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseProfessionalSnapshot(parsed);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'Professional Intelligence no está disponible: el snapshot no cumple el contrato.',
      stale: false,
      snapshot: null,
    };
  }

  const stale = isProfessionalSnapshotStale(snapshot, options?.now);
  return {
    status: 'ready',
    notice: stale
      ? 'El snapshot profesional está disponible, pero necesita refresh antes de una decisión sensible.'
      : null,
    stale,
    snapshot,
  };
}
