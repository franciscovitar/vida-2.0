import { handleManualDeliveryClaimRequest } from '@/lib/automations/delivery-claim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleManualDeliveryClaimRequest(request);
}
