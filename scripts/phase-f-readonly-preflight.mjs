/**
 * Phase F: configuration-only read-only QA preflight.
 * No requests, secret reads, database mutations, OAuth or deployments.
 * It checks exact mode selectors and safety flags, not underlying secret values.
 * A PASS does NOT certify authenticated E2E, data freshness or production.
 */
const env = process.env;
const checks = [
  {
    code: 'F01_PREVIEW',
    label: 'Entorno Vercel Preview',
    pass: env.VERCEL_ENV === 'preview',
  },
  {
    code: 'F02_BRANCH',
    label: 'Rama aislada vida-qa',
    pass: env.VERCEL_GIT_COMMIT_REF === 'vida-qa',
  },
  {
    code: 'F03_PLANNING_UI',
    label: 'Planificación V2 habilitada para QA',
    pass: env.DAILY_PLANNING_V2_UI_ENABLED === 'true',
  },
  {
    code: 'F04_TODAY_UI',
    label: 'Hoy V2 habilitado para QA',
    pass: env.TODAY_COCKPIT_V2_UI_ENABLED === 'true',
  },
  {
    code: 'F05_LEARNING_UI',
    label: 'Materias / Aprendizaje V2 habilitado para QA',
    pass: env.LEARNING_HUB_V2_UI_ENABLED === 'true',
  },
  {
    code: 'F06_PROJECTS_UI',
    label: 'Señales de Proyectos E6 habilitadas para QA',
    pass: env.PROJECTS_E6_SIGNALS_ENABLED === 'true',
  },
  {
    code: 'F07_CALENDAR_REAL',
    label: 'Google Calendar real seleccionado',
    pass: env.GOOGLE_CALENDAR_DATA_SOURCE === 'google',
  },
  {
    code: 'F08_SHEETS_DEV',
    label: 'Google Sheets DEV seleccionado',
    pass: env.DATA_SOURCE === 'google' && env.GOOGLE_SHEETS_TARGET === 'dev',
  },
  {
    code: 'F09_NOTION_REAL',
    label: 'Fuente Notion seleccionada',
    pass: env.NOTION_DATA_SOURCE === 'notion',
  },
  {
    code: 'F10_WRITES_OFF',
    label: 'Escrituras generales deshabilitadas',
    pass: env.WRITE_ACTIONS_ENABLED !== 'true',
  },
  {
    code: 'F11_HABITS_WRITES_OFF',
    label: 'Escrituras de Hábitos V2 deshabilitadas',
    pass: env.HABITS_V2_WRITES_ENABLED !== 'true',
  },
  {
    code: 'F12_HABITS_UI_OFF',
    label: 'Hábitos V2 bloqueado hasta gate de concurrencia',
    pass: env.HABITS_V2_UI_ENABLED !== 'true',
  },
  {
    code: 'F13_TASK_DATE_OFF',
    label: 'Migración de Tipo de fecha no habilitada',
    pass: env.TASK_DATE_SEMANTICS_V2_ENABLED !== 'true',
  },
  {
    code: 'F14_AGENT_API_OFF',
    label: 'API de agentes deshabilitada durante QA acotada',
    pass: env.OPENCLAW_API_ENABLED !== 'true',
  },
  {
    code: 'F15_SHEETS_PROD_WRITES_OFF',
    label: 'Permiso de escritura a Sheets PROD deshabilitado',
    pass: env.GOOGLE_SHEETS_ALLOW_PROD_WRITES !== 'true',
  },
];

console.log('Phase F — preflight de configuración QA de solo lectura');
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'BLOCKED'} [${check.code}] ${check.label}`);
}
const blocked = checks.filter((check) => !check.pass).length;
if (blocked > 0) {
  console.log(`BLOCKED: ${blocked} chequeos; no declarar QA lista ni realizar cutover.`);
  process.exitCode = 1;
} else {
  console.log('PASS: configuración compatible con QA de lectura. E2E autenticada aún pendiente.');
}
