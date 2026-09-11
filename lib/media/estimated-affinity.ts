import 'server-only';

import { inflateSync } from 'node:zlib';

const MODEL_VERSION = 'personal-fit-v1.2';
const SNAPSHOT_ENV = 'MEDIA_PERSONAL_FIT_V12_SNAPSHOT';

export interface FrozenPersonalFit {
  affinity: number;
  confidence: number;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseManifest(value: unknown): number {
  const manifest = record(value);
  if (!manifest || manifest.modelVersion !== MODEL_VERSION) {
    throw new Error('Media Personal Fit usa un manifest inválido.');
  }
  if (manifest.readOnly !== true || manifest.operationalScoreWrite !== false) {
    throw new Error('Media Personal Fit debe permanecer read-only.');
  }
  if (manifest.confidenceCertified !== false) {
    throw new Error('Media Personal Fit no debe presentar confianza certificada.');
  }

  const threshold = finiteNumber(manifest.displayMinConfidence);
  if (threshold === null || threshold < 0 || threshold > 100) {
    throw new Error('Umbral de Media Personal Fit inválido.');
  }
  return threshold;
}

function decodeSnapshot(encoded: string): UnknownRecord {
  const decoded = inflateSync(Buffer.from(encoded, 'base64')).toString('utf8');
  const payload = record(JSON.parse(decoded));
  if (!payload) throw new Error('Payload de Media Personal Fit inválido.');
  return payload;
}

/**
 * Consume un snapshot privado generado por PAS desde una variable server-side.
 * El repo público contiene sólo este contrato; nunca las afinidades personales.
 */
export function loadPrivatePersonalFitV12(
  env: NodeJS.ProcessEnv = process.env,
): Map<string, FrozenPersonalFit> {
  const encoded = env[SNAPSHOT_ENV]?.trim();
  if (!encoded) return new Map();

  const payload = decodeSnapshot(encoded);
  const threshold = parseManifest(payload.manifest);
  const predictions = record(payload.predictions);
  if (!predictions) throw new Error('Predicciones de Media Personal Fit inválidas.');

  const output = new Map<string, FrozenPersonalFit>();
  for (const [key, rawPrediction] of Object.entries(predictions)) {
    const prediction = record(rawPrediction);
    const affinity = finiteNumber(prediction?.affinity);
    const confidence = finiteNumber(prediction?.confidence);

    if (!key.trim() || affinity === null || confidence === null) {
      throw new Error('Caso de Media Personal Fit inválido.');
    }
    if (affinity < 0 || affinity > 10 || confidence < 0 || confidence > 100) {
      throw new Error('Score de Media Personal Fit fuera de rango.');
    }
    if (confidence < threshold) continue;
    if (output.has(key)) throw new Error('Clave duplicada en Media Personal Fit.');

    output.set(key, { affinity, confidence });
  }

  return output;
}
