import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  resolveProfessionalSkillsText,
  type ProfessionalSkillsData,
} from '@/lib/professional/skills-contract';

const SOURCE_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'professional-skills-matrix.json',
);

export async function loadProfessionalSkillsMatrix(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<ProfessionalSkillsData> {
  const reader = options?.readText ?? (() => readFile(SOURCE_PATH, 'utf8'));
  try {
    return resolveProfessionalSkillsText(await reader(), options?.now);
  } catch {
    return resolveProfessionalSkillsText(null, options?.now);
  }
}
