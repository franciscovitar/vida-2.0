import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  resolveSkillDemandBaseline,
  type SkillDemandBaselineData,
} from '@/lib/professional/skill-demand-contract';

const SOURCE_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'professional-skills-demand-c2.json',
);

export async function loadSkillDemandBaseline(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<SkillDemandBaselineData> {
  const reader = options?.readText ?? (() => readFile(SOURCE_PATH, 'utf8'));
  try {
    return resolveSkillDemandBaseline(await reader(), options?.now);
  } catch {
    return resolveSkillDemandBaseline(null, options?.now);
  }
}
