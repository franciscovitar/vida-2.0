import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadProfessionalSnapshot } from '@/lib/professional/snapshot';

export async function getProfessionalIntelligence() {
  await requireAuthorizedSession();
  return loadProfessionalSnapshot();
}
