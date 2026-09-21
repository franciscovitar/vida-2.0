import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadIntelligenceEditorialSnapshot } from '@/lib/intelligence/snapshot';
import { loadProfessionalSnapshot } from '@/lib/professional/snapshot';

export async function getIntelligenceHubData() {
  await requireAuthorizedSession();

  const [editorial, professional] = await Promise.all([
    loadIntelligenceEditorialSnapshot(),
    loadProfessionalSnapshot(),
  ]);

  return { editorial, professional };
}
