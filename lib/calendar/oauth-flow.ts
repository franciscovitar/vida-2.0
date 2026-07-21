/**
 * Flujo OAuth local Calendar (helpers puros, sin I/O de Google).
 * Sin server-only para poder cubrirlo en pruebas node:test.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  CALENDAR_OAUTH_STATE_COOKIE,
  CALENDAR_OAUTH_STATE_MAX_AGE_SEC,
  CALENDAR_READONLY_SCOPE,
  GOOGLE_OAUTH_AUTH_URL,
} from '@/lib/calendar/constants';

export type CalendarOAuthGuardReason = 'production' | 'non-local';

/** Solo desarrollo local: rechaza producción y hosts no-localhost. */
export function isCalendarOAuthAllowed(input: {
  nodeEnv?: string | null;
  vercel?: string | null;
  host?: string | null;
}): { ok: true } | { ok: false; reason: CalendarOAuthGuardReason } {
  if (input.nodeEnv === 'production' || input.vercel === '1') {
    return { ok: false, reason: 'production' };
  }

  const host = (input.host ?? '').split(':')[0]?.toLowerCase() ?? '';
  if (host !== 'localhost' && host !== '127.0.0.1') {
    return { ok: false, reason: 'non-local' };
  }

  return { ok: true };
}

/** State criptográficamente aleatorio (base64url). */
export function generateOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

/** Comparación en tiempo constante para state. */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface CalendarConsentUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
}

/**
 * URL de consentimiento con exactamente el scope readonly,
 * access_type=offline, prompt=consent, response_type=code.
 * Sin include_granted_scopes.
 */
export function buildCalendarConsentUrl(input: CalendarConsentUrlInput): string {
  const url = new URL(GOOGLE_OAUTH_AUTH_URL);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', CALENDAR_READONLY_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', input.state);
  return url.toString();
}

/** Opciones de cookie del state (Secure=false solo por localhost). */
export function calendarOAuthStateCookieOptions(maxAge = CALENDAR_OAUTH_STATE_MAX_AGE_SEC) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: false as const,
    maxAge,
    path: '/api/calendar/oauth',
  };
}

export { CALENDAR_OAUTH_STATE_COOKIE };

/** Escape mínimo para embeber texto en HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const usedAuthorizationCodes = new Set<string>();

function hashAuthorizationCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** true si el code se acepta por primera vez; false si ya se usó. */
export function consumeAuthorizationCode(code: string): boolean {
  const digest = hashAuthorizationCode(code);
  if (usedAuthorizationCodes.has(digest)) return false;
  usedAuthorizationCodes.add(digest);
  return true;
}

/** Solo para pruebas. */
export function resetConsumedAuthorizationCodes(): void {
  usedAuthorizationCodes.clear();
}

export type CallbackValidationFailure =
  'missing-code' | 'missing-state' | 'state-mismatch' | 'google-error' | 'code-reused';

export function validateOAuthCallback(input: {
  code: string | null;
  state: string | null;
  cookieState: string | null;
  googleError: string | null;
}): { ok: true; code: string } | { ok: false; reason: CallbackValidationFailure } {
  if (input.googleError) return { ok: false, reason: 'google-error' };
  if (!input.code) return { ok: false, reason: 'missing-code' };
  if (!input.state || !input.cookieState) return { ok: false, reason: 'missing-state' };
  if (!timingSafeEqualString(input.state, input.cookieState)) {
    return { ok: false, reason: 'state-mismatch' };
  }
  if (!consumeAuthorizationCode(input.code)) return { ok: false, reason: 'code-reused' };
  return { ok: true, code: input.code };
}

export function oauthErrorPageMessage(
  reason: CallbackValidationFailure | 'not-configured' | 'forbidden',
): string {
  switch (reason) {
    case 'not-configured':
      return 'Faltan GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET o GOOGLE_CALENDAR_REDIRECT_URI.';
    case 'forbidden':
      return 'Este flujo OAuth solo está disponible en desarrollo local.';
    case 'missing-code':
      return 'No se recibió el código de autorización.';
    case 'missing-state':
      return 'Falta el state de seguridad. Volvé a iniciar el flujo.';
    case 'state-mismatch':
      return 'El state no coincide. Posible intento inválido; reiniciá el flujo.';
    case 'google-error':
      return 'Google devolvió un error de autorización. Intentá de nuevo.';
    case 'code-reused':
      return 'Este callback ya fue usado. Iniciá el flujo otra vez.';
    default:
      return 'No se pudo completar la autorización.';
  }
}

export function noRefreshTokenMessage(): string {
  return [
    'Google no devolvió un refresh_token.',
    'Repetí el flujo asegurando prompt=consent.',
    'Si ya autorizaste antes, revocá el acceso de esta app en',
    'https://myaccount.google.com/permissions y volvé a intentar.',
  ].join(' ');
}

/** HTML mínimo de éxito: refresh token una sola vez, sin analytics ni storage. */
export function buildOAuthSuccessHtml(refreshToken: string): string {
  const token = escapeHtml(refreshToken);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <meta http-equiv="Cache-Control" content="no-store" />
  <title>Calendar OAuth — refresh token</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.45;color:#111;background:#fafafa}
    code,pre{font-family:ui-monospace,monospace;font-size:0.85rem;word-break:break-all}
    pre{padding:0.75rem;border:1px solid #ddd;border-radius:6px;background:#fff}
    .warn{padding:0.75rem;border:1px solid #c4a000;background:#fff8e1;border-radius:6px;margin:1rem 0}
    button{padding:0.45rem 0.85rem;cursor:pointer}
  </style>
</head>
<body>
  <h1>Refresh token listo</h1>
  <p>Copiá este valor manualmente a <code>GOOGLE_CALENDAR_REFRESH_TOKEN</code> en <code>.env.local</code>.</p>
  <div class="warn">
    <strong>No lo pegues</strong> en chats, commits, capturas ni issues.
    Cerrá esta pestaña después de copiarlo y reiniciá el servidor de desarrollo.
  </div>
  <pre id="rt" role="textbox" aria-label="Refresh token">${token}</pre>
  <p><button type="button" id="copy">Copiar</button> <span id="status" aria-live="polite"></span></p>
  <script>
    document.getElementById('copy').addEventListener('click', async function () {
      var text = document.getElementById('rt').textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        document.getElementById('status').textContent = 'Copiado.';
      } catch (e) {
        document.getElementById('status').textContent = 'No se pudo copiar automáticamente; seleccioná el texto a mano.';
      }
    });
  </script>
</body>
</html>`;
}

export function buildOAuthErrorHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <meta http-equiv="Cache-Control" content="no-store" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.45}
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <p><a href="/api/calendar/oauth/start">Volver a intentar</a></p>
</body>
</html>`;
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
} as const;
