import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadIntelligenceEditorialSnapshot } from '@/lib/intelligence/snapshot';
import { loadCareerResilience } from '@/lib/professional/career-resilience';
import { loadProfessionalSnapshot } from '@/lib/professional/snapshot';
import { loadTechnologyLibrary } from '@/lib/professional/technology-library';

export async function getProfessionalIntelligence() {
  await requireAuthorizedSession();
  return loadProfessionalSnapshot();
}

export async function getProfessionalIntelligencePageData() {
  await requireAuthorizedSession();

  const [professional, editorial, technologyLibrary, careerResilience] = await Promise.all([
    loadProfessionalSnapshot(),
    loadIntelligenceEditorialSnapshot(),
    loadTechnologyLibrary(),
    loadCareerResilience(),
  ]);

  return { professional, editorial, technologyLibrary, careerResilience };
}
