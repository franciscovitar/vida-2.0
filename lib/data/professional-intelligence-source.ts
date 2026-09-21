import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadIntelligenceEditorialSnapshot } from '@/lib/intelligence/snapshot';
import { loadProfessionalSnapshot } from '@/lib/professional/snapshot';

export async function getProfessionalIntelligence() {
  await requireAuthorizedSession();
  return loadProfessionalSnapshot();
}

export async function getProfessionalIntelligencePageData() {
  await requireAuthorizedSession();

  const [professional, editorial] = await Promise.all([
    loadProfessionalSnapshot(),
    loadIntelligenceEditorialSnapshot(),
  ]);

  return { professional, editorial };
}
