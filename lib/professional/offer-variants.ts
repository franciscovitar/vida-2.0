import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveProfessionalOfferVariantsText } from '@/lib/professional/offer-variants-contract';
import type { ProfessionalOfferVariantsData } from '@/types/professional-offers';

const OFFER_VARIANTS_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'professional-offer-variants.json',
);

export async function loadProfessionalOfferVariants(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<ProfessionalOfferVariantsData> {
  const readText = options?.readText ?? (() => readFile(OFFER_VARIANTS_PATH, 'utf8'));

  try {
    return resolveProfessionalOfferVariantsText(await readText(), options?.now);
  } catch {
    return resolveProfessionalOfferVariantsText(null, options?.now);
  }
}
