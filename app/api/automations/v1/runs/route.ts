import { handleAutomationResultRequest } from '@/lib/automations/callback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleAutomationResultRequest(request);
}
