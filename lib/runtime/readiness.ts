/**
 * Diagnóstico puro y sanitizado de configuración.
 * No consulta red, no lee archivos y nunca devuelve valores de entorno.
 */
import { getWriteRuntimeStatus } from '@/lib/actions/config';
import {
  resolveCalendarConfig,
  resolveCalendarDataSource,
} from '@/lib/calendar/config-resolve';
import { getGoogleConfig } from '@/lib/data/config';
import { getNotionConfig, getNotionDataSource } from '@/lib/notion/config';
import { getOpenClawRuntimeStatus } from '@/lib/openclaw/config';
import { getWebCatalogNotionConfig, isWebCatalogEnabled } from '@/lib/web-catalog/config';
import type {
  DeploymentPreflightIssue,
  DeploymentPreflightResult,
  RuntimeEnvironment,
  RuntimeIntegrationView,
  RuntimeReadinessSnapshot,
} from '@/types/runtime';

type Env = Readonly<Record<string, string | undefined>>;

function exactTrue(value: string | undefined): boolean {
  return value === 'true';
}

function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function resolveRuntimeEnvironment(env: Env): RuntimeEnvironment {
  const value = env.VERCEL_ENV?.trim();
  if (value === 'production' || value === 'preview' || value === 'development') return value;
  return 'local';
}

function issue(
  code: string,
  severity: DeploymentPreflightIssue['severity'],
  message: string,
): DeploymentPreflightIssue {
  return { code, severity, message };
}

function compareIssues(a: DeploymentPreflightIssue, b: DeploymentPreflightIssue): number {
  const severityOrder = { error: 0, warning: 1 } as const;
  return severityOrder[a.severity] - severityOrder[b.severity] || a.code.localeCompare(b.code);
}

/**
 * Preflight de configuración para un Preview completo y seguro.
 * Comprueba presencia/coherencia, no conectividad externa.
 */
export function buildPreviewPreflight(env: Env): DeploymentPreflightResult {
  const issues: DeploymentPreflightIssue[] = [];
  const environment = resolveRuntimeEnvironment(env);

  if (environment !== 'preview') {
    issues.push(
      issue(
        'environment-not-preview',
        'error',
        'VERCEL_ENV debe ser preview para certificar este deployment.',
      ),
    );
  }

  if (!exactTrue(env.AUTH_TRUST_HOST)) {
    issues.push(
      issue('auth-trust-host-disabled', 'error', 'AUTH_TRUST_HOST debe ser exactamente true.'),
    );
  }

  const authVariables = [
    ['AUTH_SECRET', env.AUTH_SECRET],
    ['AUTH_GOOGLE_ID', env.AUTH_GOOGLE_ID],
    ['AUTH_GOOGLE_SECRET', env.AUTH_GOOGLE_SECRET],
    ['AUTH_ALLOWED_EMAILS', env.AUTH_ALLOWED_EMAILS],
  ] as const;
  for (const [name, value] of authVariables) {
    if (!present(value)) {
      issues.push(
        issue(`auth-missing-${name.toLowerCase()}`, 'error', `Falta configurar ${name}.`),
      );
    }
  }

  if (env.DATA_SOURCE !== 'google') {
    issues.push(
      issue('sheets-not-live', 'error', 'DATA_SOURCE debe ser google en el Preview final.'),
    );
  } else {
    const sheets = getGoogleConfig(env);
    if (!sheets.ok) {
      issues.push(
        issue('sheets-misconfigured', 'error', 'Google Sheets no tiene configuración completa.'),
      );
    } else if (sheets.config.target !== 'dev') {
      issues.push(
        issue('sheets-target-not-dev', 'error', 'Preview debe usar exclusivamente el Sheet DEV.'),
      );
    }
  }

  if (exactTrue(env.GOOGLE_SHEETS_ALLOW_PROD_WRITES)) {
    issues.push(
      issue(
        'prod-writes-enabled',
        'error',
        'GOOGLE_SHEETS_ALLOW_PROD_WRITES debe permanecer desactivada en Preview.',
      ),
    );
  }

  if (getNotionDataSource(env) !== 'notion') {
    issues.push(
      issue('notion-not-live', 'error', 'NOTION_DATA_SOURCE debe ser notion en el Preview final.'),
    );
  } else if (!getNotionConfig(env).ok) {
    issues.push(
      issue('notion-misconfigured', 'error', 'Notion operativo no tiene configuración válida.'),
    );
  }

  if (resolveCalendarDataSource(env.GOOGLE_CALENDAR_DATA_SOURCE) !== 'google') {
    issues.push(
      issue(
        'calendar-not-live',
        'error',
        'GOOGLE_CALENDAR_DATA_SOURCE debe ser google en el Preview final.',
      ),
    );
  } else if (!resolveCalendarConfig(env).ok) {
    issues.push(
      issue(
        'calendar-misconfigured',
        'error',
        'Google Calendar no tiene configuración completa de solo lectura.',
      ),
    );
  }

  if (!isWebCatalogEnabled(env)) {
    issues.push(
      issue('catalog-disabled', 'error', 'WEB_CATALOG_ENABLED debe ser exactamente true.'),
    );
  } else if (!getWebCatalogNotionConfig(env).ok) {
    issues.push(
      issue(
        'catalog-misconfigured',
        'error',
        'El Registro Web está activo pero no tiene configuración completa.',
      ),
    );
  }

  if (exactTrue(env.WRITE_ACTIONS_ENABLED)) {
    issues.push(
      issue(
        'writes-enabled',
        'error',
        'WRITE_ACTIONS_ENABLED debe permanecer false durante el cierre de Web V1.',
      ),
    );
  }

  if (exactTrue(env.WRITE_ACTIONS_USE_MEMORY)) {
    issues.push(
      issue(
        'memory-writes-enabled',
        'error',
        'WRITE_ACTIONS_USE_MEMORY no puede habilitarse en Preview.',
      ),
    );
  }

  if (exactTrue(env.OPENCLAW_API_ENABLED)) {
    issues.push(
      issue(
        'openclaw-enabled',
        'error',
        'OPENCLAW_API_ENABLED debe permanecer false hasta la fase de OpenClaw.',
      ),
    );
  }

  if (present(env.GOOGLE_CALENDAR_REDIRECT_URI)) {
    issues.push(
      issue(
        'calendar-local-redirect-present',
        'error',
        'GOOGLE_CALENDAR_REDIRECT_URI es solo local y no debe existir en Vercel Preview.',
      ),
    );
  }

  if (present(env.CALENDAR_TRACE_STAGES)) {
    issues.push(
      issue(
        'calendar-trace-enabled',
        'warning',
        'El trace de Calendar debería quedar desactivado fuera del diagnóstico local.',
      ),
    );
  }

  if (present(env.SHEETS_ALLOW_PROD_TARGET_FOR_TESTS)) {
    issues.push(
      issue(
        'test-prod-target-override-present',
        'error',
        'El override de tests para el target PROD no debe existir en Preview.',
      ),
    );
  }

  issues.sort(compareIssues);
  return {
    environment,
    ready: issues.every((item) => item.severity !== 'error'),
    issues,
  };
}

function sheetsIntegration(env: Env): RuntimeIntegrationView {
  if (env.DATA_SOURCE !== 'google') {
    return {
      id: 'sheets',
      label: 'Google Sheets',
      status: 'mock',
      summary: 'Datos simulados; no se consultan credenciales.',
      blocking: true,
    };
  }

  const config = getGoogleConfig(env);
  if (!config.ok) {
    return {
      id: 'sheets',
      label: 'Google Sheets',
      status: 'misconfigured',
      summary: 'Modo Google activo, pero la configuración está incompleta o no es segura.',
      blocking: true,
    };
  }

  return {
    id: 'sheets',
    label: 'Google Sheets',
    status: 'configured',
    summary: `Configuración válida sobre target ${config.config.target.toUpperCase()}.`,
    blocking: config.config.target !== 'dev',
  };
}

function notionIntegration(env: Env): RuntimeIntegrationView {
  if (getNotionDataSource(env) !== 'notion') {
    return {
      id: 'notion',
      label: 'Notion operativo',
      status: 'mock',
      summary: 'Áreas, Proyectos y Tareas usan datos simulados.',
      blocking: true,
    };
  }

  const config = getNotionConfig(env);
  return config.ok
    ? {
        id: 'notion',
        label: 'Notion operativo',
        status: 'configured',
        summary: 'Lectura configurada para Áreas, Proyectos y Tareas.',
        blocking: false,
      }
    : {
        id: 'notion',
        label: 'Notion operativo',
        status: 'misconfigured',
        summary: 'Modo Notion activo, pero faltan datos o la lista permitida no coincide.',
        blocking: true,
      };
}

function calendarIntegration(env: Env): RuntimeIntegrationView {
  if (resolveCalendarDataSource(env.GOOGLE_CALENDAR_DATA_SOURCE) !== 'google') {
    return {
      id: 'calendar',
      label: 'Google Calendar',
      status: 'mock',
      summary: 'Agenda simulada; no se consultan eventos reales.',
      blocking: true,
    };
  }

  return resolveCalendarConfig(env).ok
    ? {
        id: 'calendar',
        label: 'Google Calendar',
        status: 'configured',
        summary: 'Lectura de eventos configurada sin permisos de escritura.',
        blocking: false,
      }
    : {
        id: 'calendar',
        label: 'Google Calendar',
        status: 'misconfigured',
        summary: 'Modo Google activo, pero falta configuración de solo lectura.',
        blocking: true,
      };
}

function catalogIntegration(env: Env): RuntimeIntegrationView {
  if (!isWebCatalogEnabled(env)) {
    return {
      id: 'web-catalog',
      label: 'Registro Web',
      status: 'safe-disabled',
      summary: 'Desactivado; las rutas fijas conservan su fallback.',
      blocking: true,
    };
  }

  return getWebCatalogNotionConfig(env).ok
    ? {
        id: 'web-catalog',
        label: 'Registro Web',
        status: 'configured',
        summary: 'Catálogo documental configurado en modo lectura.',
        blocking: false,
      }
    : {
        id: 'web-catalog',
        label: 'Registro Web',
        status: 'misconfigured',
        summary: 'Feature activa, pero falta token o referencia del catálogo.',
        blocking: true,
      };
}

function writesIntegration(env: Env): RuntimeIntegrationView {
  const status = getWriteRuntimeStatus(env);
  if (!status.writesEnabled) {
    return {
      id: 'writes',
      label: 'Escrituras avanzadas',
      status: 'safe-disabled',
      summary: 'Desactivadas para el cierre seguro de Web V1.',
      blocking: false,
    };
  }

  const configured = status.issues.length === 0;
  return {
    id: 'writes',
    label: 'Escrituras avanzadas',
    status: configured ? 'configured' : 'misconfigured',
    summary: configured
      ? 'Habilitadas; requieren una fase de validación separada.'
      : 'Habilitadas con configuración incompleta.',
    blocking: true,
  };
}

function openClawIntegration(env: Env): RuntimeIntegrationView {
  const status = getOpenClawRuntimeStatus(env);
  if (status === 'disabled') {
    return {
      id: 'openclaw',
      label: 'OpenClaw API',
      status: 'safe-disabled',
      summary: 'Desactivada hasta la fase de integración conversacional.',
      blocking: false,
    };
  }

  return {
    id: 'openclaw',
    label: 'OpenClaw API',
    status: status === 'ready' ? 'configured' : 'misconfigured',
    summary:
      status === 'ready'
        ? 'API HMAC configurada; permanece fuera del alcance de Web V1.'
        : 'Feature activa con configuración incompleta.',
    blocking: true,
  };
}

export function buildRuntimeReadiness(env: Env): RuntimeReadinessSnapshot {
  return {
    environment: resolveRuntimeEnvironment(env),
    integrations: [
      sheetsIntegration(env),
      notionIntegration(env),
      calendarIntegration(env),
      catalogIntegration(env),
      writesIntegration(env),
      openClawIntegration(env),
    ],
    preview: buildPreviewPreflight(env),
  };
}
