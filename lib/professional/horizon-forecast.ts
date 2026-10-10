import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  resolveProfessionalHorizonText,
  type ProfessionalHorizonData,
} from '@/lib/professional/horizon-contract';

const SOURCE_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'professional-forecast-horizons.json',
);

export async function loadProfessionalHorizonForecast(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<ProfessionalHorizonData> {
  const reader = options?.readText ?? (() => readFile(SOURCE_PATH, 'utf8'));
  try {
    return resolveProfessionalHorizonText(await reader(), options?.now);
  } catch {
    return resolveProfessionalHorizonText(null, options?.now);
  }
}
