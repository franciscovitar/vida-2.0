import { handleScheduledAutomationRequest } from '@/lib/automations/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleScheduledAutomationRequest(request);
}
