import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadIntelligenceEditorialSnapshot } from '@/lib/intelligence/snapshot';
import { loadCareerResilience } from '@/lib/professional/career-resilience';
import { loadProfessionalHorizonForecast } from '@/lib/professional/horizon-forecast';
import { loadProfessionalMarketDetail } from '@/lib/professional/market-detail';
import { loadProfessionalOfferVariants } from '@/lib/professional/offer-variants';
import { loadProfessionalSnapshot } from '@/lib/professional/snapshot';
import { loadProfessionalVisualization } from '@/lib/professional/visualization';
import { loadTechnologyLibrary } from '@/lib/professional/technology-library';

export async function getProfessionalIntelligence() {
  await requireAuthorizedSession();
  return loadProfessionalSnapshot();
}

export async function getProfessionalIntelligencePageData() {
  await requireAuthorizedSession();
  return { professional: await loadProfessionalSnapshot() };
}

export async function getProfessionalToolsPageData() {
  await requireAuthorizedSession();
  return loadProfessionalOfferVariants();
}

export async function getProfessionalMarketPageData() {
  await requireAuthorizedSession();

  const [professional, careerResilience, marketDetail, visualizations, horizonForecast] =
    await Promise.all([
      loadProfessionalSnapshot(),
      loadCareerResilience(),
      loadProfessionalMarketDetail(),
      loadProfessionalVisualization(),
      loadProfessionalHorizonForecast(),
    ]);

  return { professional, careerResilience, marketDetail, visualizations, horizonForecast };
}

export async function getProfessionalGrowthPageData() {
  await requireAuthorizedSession();
  return loadProfessionalSnapshot();
}

export async function getProfessionalLibraryPageData() {
  await requireAuthorizedSession();

  const [editorial, technologyLibrary] = await Promise.all([
    loadIntelligenceEditorialSnapshot(),
    loadTechnologyLibrary(),
  ]);

  return { editorial, technologyLibrary };
}
