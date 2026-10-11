/**
 * DEV-ONLY Firestore reserve-before-send adapter. No route, scheduler, UI, Sheets
 * writer or issuer calls this module. Never reuse the Sheets service account.
 *
 * Firestore is a durable at-most-once DISPATCH decision, NOT an atomic commit
 * with Google Sheets. A dispatched/unknown result must never be retried.
 * Recovery after ledger loss: freeze issuers, reconcile physical Sheets rows,
 * permanently quarantine unresolved IDs. Never expire/delete reservations.
 */
import { createHash, createSign, randomUUID } from 'node:crypto';
import type {
  PlanningV2LedgerOperation,
  PlanningV2LedgerRecord,
  PlanningV2LedgerStatus,
} from './dispatch-ledger-v2';

export const PLANNING_V2_FIRESTORE_SECRET_NAME =
  'PLANNING_V2_DEV_FIRESTORE_SERVICE_ACCOUNT_JSON';
export const PLANNING_V2_FIRESTORE_PROJECT_NAME =
  'PLANNING_V2_DEV_FIRESTORE_PROJECT_ID';
export const PLANNING_V2_FIRESTORE_ENABLED_NAME =
  'PLANNING_V2_DEV_FIRESTORE_LEDGER_ENABLED';

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';
const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const COLLECTION = 'planning_v2_dispatch_v1';
const HASH = /^[a-f0-9]{64}$/;
const PROJECT = /^[a-z][a-z0-9-]{5,62}$/;
const IDS = {
  execution: /^vida2:tasks-daily-planning:v2:execution:[a-f0-9]{64}$/,
  orientation: /^vida2:tasks-daily-planning:v2:orientation:\d{4}-\d{2}-\d{2}:[a-f0-9]{64}$/,
  assessment: /^vida2:assessment-progress:v1:[a-f0-9]{64}$/,
} as const;

export interface PlanningV2FirestoreDevConfig {
  readonly projectId: string;
  readonly clientEmail: string;
  readonly privateKey: string;
}

export type PlanningV2FirestoreDevConfigResult =
  | { readonly ok: true; readonly value: PlanningV2FirestoreDevConfig }
  | { readonly ok: false };

/** The three independent guards are mandatory; generic Preview is denied. */
export function resolvePlanningV2FirestoreDevConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PlanningV2FirestoreDevConfigResult {
  if (
    env[PLANNING_V2_FIRESTORE_ENABLED_NAME] !== 'true' ||
    env.VERCEL_ENV !== 'preview' ||
    env.VERCEL_GIT_COMMIT_REF !== 'vida-qa' ||
    env.GOOGLE_SHEETS_TARGET !== 'dev' ||
    env.DATA_SOURCE !== 'google'
  ) return { ok: false };

  const projectId = env[PLANNING_V2_FIRESTORE_PROJECT_NAME]?.trim();
  const json = env[PLANNING_V2_FIRESTORE_SECRET_NAME];
  if (!projectId || !PROJECT.test(projectId) || !json || json.length > 16384) {
    return { ok: false };
  }
  try {
    const key = JSON.parse(json) as Record<string, unknown>;
    const email = key.client_email;
    const privateKey = key.private_key;
    if (
      key.type !== 'service_account' ||
      key.project_id !== projectId ||
      key.token_uri !== TOKEN_URI ||
      typeof email !== 'string' ||
      !email.endsWith('@' + projectId + '.iam.gserviceaccount.com') ||
      !/^[a-z][a-z0-9-]*@/.test(email) ||
      typeof privateKey !== 'string' ||
      !privateKey.includes('-----BEGIN PRIVATE KEY-----') ||
      !privateKey.includes('-----END PRIVATE KEY-----')
    ) return { ok: false };
    return { ok: true, value: { projectId, clientEmail: email, privateKey } };
  } catch {
    return { ok: false };
  }
}

export function validPlanningV2FirestoreRecord(record: PlanningV2LedgerRecord): boolean {
  return (
    !!record && typeof record === 'object' &&
    Object.keys(record).length === 3 &&
    Object.hasOwn(IDS, record.kind) &&
    typeof record.recordId === 'string' &&
    IDS[record.kind]?.test(record.recordId) === true &&
    typeof record.payloadDigest === 'string' && HASH.test(record.payloadDigest)
  );
}

type Field = { stringValue: string };
type Stored = {
  name: string;
  updateTime: string;
  fields: { kind: Field; digest: Field; state: Field };
};

function validStored(value: unknown, expected: string): value is Stored {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Partial<Stored>;
  return (
    doc.name === expected &&
    typeof doc.updateTime === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(doc.updateTime) &&
    typeof doc.fields?.kind?.stringValue === 'string' &&
    typeof doc.fields?.digest?.stringValue === 'string' &&
    typeof doc.fields?.state?.stringValue === 'string'
  );
}

async function jsonDocument(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (raw.length === 0 || raw.length > 8192) throw new Error('invalid-document');
  return JSON.parse(raw) as unknown;
}

function jwtAssertion(config: PlanningV2FirestoreDevConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (data: unknown): string =>
    Buffer.from(JSON.stringify(data)).toString('base64url');
  const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' +
    encode({
      iss: config.clientEmail,
      scope: DATASTORE_SCOPE,
      aud: TOKEN_URI,
      iat: now,
      exp: now + 3600,
      jti: randomUUID(),
    });
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return unsigned + '.' + signer.sign(config.privateKey).toString('base64url');
}

/**
 * Credential-bound provider adapter. Only instantiate after resolving the
 * strict, branch-specific env config. Tests inject mock fetch; no live tests.
 */
export function createPlanningV2FirestoreDispatchLedger(
  config: PlanningV2FirestoreDevConfig,
  fetchImpl: typeof fetch = fetch,
): {
  transition: (
    operation: PlanningV2LedgerOperation,
    record: PlanningV2LedgerRecord,
  ) => Promise<PlanningV2LedgerStatus>;
} {
  // No browser boundary: only server Node crypto may hold this credential.
  if (typeof window !== 'undefined') throw new Error('server-only-firestore-ledger');
  if (
    !PROJECT.test(config.projectId) ||
    !config.clientEmail.endsWith('@' + config.projectId + '.iam.gserviceaccount.com')
  ) throw new Error('invalid-firestore-dev-config');

  let cachedToken: { token: string; expires: number } | undefined;
  let tokenRequest: Promise<string> | undefined;

  async function accessToken(): Promise<string> {
    if (cachedToken && cachedToken.expires > Date.now() + 300000) {
      return cachedToken.token;
    }
    if (tokenRequest) return tokenRequest;
    tokenRequest = (async () => {
      const response = await fetchImpl(TOKEN_URI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwtAssertion(config),
        }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('token-unavailable');
      const data = await jsonDocument(response) as Record<string, unknown>;
      if (
        typeof data.access_token !== 'string' || !data.access_token ||
        typeof data.expires_in !== 'number' ||
        data.expires_in < 360 || data.expires_in > 3600
      ) throw new Error('token-invalid');
      cachedToken = {
        token: data.access_token,
        expires: Date.now() + data.expires_in * 1000,
      };
      return data.access_token;
    })().finally(() => { tokenRequest = undefined; });
    return tokenRequest;
  }

  async function provider(
    url: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown,
  ): Promise<Response> {
    const token = await accessToken();
    return fetchImpl(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
  }

  return {
    async transition(operation, record) {
      if (
        (operation !== 'prepare' && operation !== 'dispatch') ||
        !validPlanningV2FirestoreRecord(record)
      ) return 'blocked';

      const hash = createHash('sha256')
        .update(record.kind + ':' + record.recordId).digest('hex');
      const root = FIRESTORE_BASE + '/projects/' + config.projectId +
        '/databases/(default)/documents/' + COLLECTION;
      const name = 'projects/' + config.projectId +
        '/databases/(default)/documents/' + COLLECTION + '/' + hash;
      const docUrl = root + '/' + hash;
      try {
        const get = await provider(docUrl, 'GET');
        if (get.status === 404) {
          if (operation !== 'prepare') return 'blocked';
          // Create-only: simultaneous reserves cannot overwrite one another.
          const create = await provider(root + '?documentId=' + hash, 'POST', {
            fields: {
              kind: { stringValue: record.kind },
              digest: { stringValue: record.payloadDigest },
              state: { stringValue: 'prepared' },
            },
          });
          // 409/412 and ambiguous/lost responses NEVER authorize dispatch.
          if (!create.ok) return 'blocked';
          const created = await jsonDocument(create);
          return validStored(created, name) &&
            created.fields.kind.stringValue === record.kind &&
            created.fields.digest.stringValue === record.payloadDigest &&
            created.fields.state.stringValue === 'prepared'
            ? 'prepared' : 'unavailable';
        }

        if (!get.ok) return 'unavailable';
        const doc = await jsonDocument(get);
        if (!validStored(doc, name)) return 'blocked';
        if (doc.fields.kind.stringValue !== record.kind) return 'conflict';
        if (doc.fields.digest.stringValue !== record.payloadDigest) return 'conflict';
        if (doc.fields.state.stringValue === 'dispatched') return 'uncertain';
        if (doc.fields.state.stringValue !== 'prepared') return 'blocked';
        if (operation === 'prepare') return 'already-prepared';

        // Firestore compares updateTime atomically: exactly one CAS winner.
        // Never place a Sheets POST inside this transition or a transaction.
        const patch = await provider(
          docUrl + '?updateMask.fieldPaths=state&currentDocument.updateTime=' +
            encodeURIComponent(doc.updateTime),
          'PATCH',
          {
            name,
            fields: { state: { stringValue: 'dispatched' } },
          },
        );
        if (!patch.ok) return 'blocked';
        const updated = await jsonDocument(patch);
        return validStored(updated, name) &&
          updated.fields.kind.stringValue === record.kind &&
          updated.fields.digest.stringValue === record.payloadDigest &&
          updated.fields.state.stringValue === 'dispatched'
          ? 'dispatch-once' : 'unavailable';
      } catch {
        // This includes token failure, malformed reply and lost PATCH response:
        // an unknown outcome is never proof another send is allowed.
        return 'unavailable';
      }
    },
  };
}
