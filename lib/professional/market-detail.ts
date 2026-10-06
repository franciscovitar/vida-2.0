import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveProfessionalMarketDetailText } from '@/lib/professional/market-detail-contract';
import type { ProfessionalMarketDetailData } from '@/types/professional-market-detail';

const MARKET_DETAIL_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'professional-market-detail.json',
);

export async function loadProfessionalMarketDetail(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<ProfessionalMarketDetailData> {
  const readText = options?.readText ?? (() => readFile(MARKET_DETAIL_PATH, 'utf8'));

  try {
    return resolveProfessionalMarketDetailText(await readText(), options?.now);
  } catch {
    return resolveProfessionalMarketDetailText(null, options?.now);
  }
}
