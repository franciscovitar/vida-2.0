import { verifySession } from '@/lib/auth/dal';
import { handleStudyAttemptPost } from '@/lib/study-engine/attempt-api';
import { createStudyRemoteAttemptStoreFromEnv } from '@/lib/study-engine/remote-attempt-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: HEADERS,
    });
  }

  const store = createStudyRemoteAttemptStoreFromEnv();
  if (!store) {
    return new Response(JSON.stringify({ ok: false, error: 'remote-store-unavailable' }), {
      status: 503,
      headers: HEADERS,
    });
  }

  return handleStudyAttemptPost(request, session.userId, store);
}
