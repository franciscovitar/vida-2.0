import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveWorldPieceText, resolveWorldSurfaceText } from '@/lib/world/contract';
import type {
  WorldPieceData,
  WorldPieceSummary,
  WorldSurfaceData,
  WorldSurfaceSnapshot,
} from '@/types/world-intelligence';

const SURFACE_PATH = path.join(process.cwd(), 'data', 'generated', 'world', 'surface.json');

function piecePath(summary: WorldPieceSummary): string {
  return path.join(process.cwd(), 'data', 'generated', 'world', 'pieces', `${summary.slug}.json`);
}

export async function loadWorldSurface(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<WorldSurfaceData> {
  const readText = options?.readText ?? (() => readFile(SURFACE_PATH, 'utf8'));

  try {
    return resolveWorldSurfaceText(await readText(), options?.now);
  } catch {
    return resolveWorldSurfaceText(null, options?.now);
  }
}

export async function loadWorldPiece(
  snapshot: WorldSurfaceSnapshot,
  summary: WorldPieceSummary,
  options?: {
    readText?: () => Promise<string>;
    now?: Date;
  },
): Promise<WorldPieceData> {
  const readText = options?.readText ?? (() => readFile(piecePath(summary), 'utf8'));

  try {
    return resolveWorldPieceText(await readText(), summary, snapshot, options?.now);
  } catch {
    return resolveWorldPieceText(null, summary, snapshot, options?.now);
  }
}
