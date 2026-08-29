import {
  Bot,
  CircleAlert,
  CircleCheckBig,
  Palette,
  PlugZap,
  ServerCog,
  Settings,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import type { Metadata } from 'next';

import {
  loadLegacyTaskRollbackRepairState,
  repairLegacyTaskRollbackAction,
} from '@/app/actions/maintenance';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ThemeControl } from '@/components/ui/ThemeControl';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getOpenClawAgentStatuses } from '@/lib/openclaw/agent-status';
import { getAutomationsDashboardData } from '@/lib/automations/dashboard';
import type { AutomationReadinessState } from '@/lib/automations/readiness';
import { getRuntimeReadiness } from '@/lib/runtime/server-readiness';
import type { Domain } from '@/types';
import type { RuntimeIntegrationStatus } from '@/types/runtime';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Ajustes' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<RuntimeIntegrationStatus, string> = {
  configured: 'Configurada',
  mock: 'Simulada',
  'safe-disabled': 'Desactivada',
  misconfigured: 'Revisar',
};

const STATUS_DOMAINS: Record<RuntimeIntegrationStatus, Domain> = {
  configured: 'habits',
  mock: 'neutral',
  'safe-disabled': 'neutral',
  misconfigured: 'danger',
};

const ENVIRONMENT_LABELS = {
  local: 'Local',
  development: 'Development',
  preview: 'Preview',
  production: 'Production',
} as const;

const AGENT_STATUS_LABELS = {
  ready: 'Lista',
  'pending-credentials': 'Pendiente',
  misconfigured: 'Revisar',
  disabled: 'Desactivada',
} as const;

const AGENT_STATUS_DOMAINS = {
  ready: 'habits',
  'pending-credentials': 'neutral',
  misconfigured: 'danger',
  disabled: 'neutral',
} as const;

const AUTOMATION_STATUS_LABELS: Record<AutomationReadinessState, string> = {
  disabled: 'Desactivadas',
  misconfigured: 'Revisar',
  degraded: 'Degradadas',
  ready: 'Listas',
  paused: 'Pausadas',
};

const AUTOMATION_STATUS_DOMAINS: Record<AutomationReadinessState, Domain> = {
  disabled: 'neutral',
  misconfigured: 'danger',
  degraded: 'projects',
  ready: 'habits',
  paused: 'projects',
};

export default async function AjustesPage() {
  await requireAuthorizedSession();
  const maintenanceState = await loadLegacyTaskRollbackRepairState();
  const readiness = getRuntimeReadiness();
  const agents = getOpenClawAgentStatuses();
  const automations = await getAutomationsDashboardData();
  const automationCounts = automations.items.reduce(
    (counts, item) => ({ ...counts, [item.status]: counts[item.status] + 1 }),
    { ready: 0, disabled: 0, degraded: 0, misconfigured: 0, paused: 0 },
  );
  const lastAutomationRun = automations.recentRuns[0] ?? null;
  const errors = readiness.preview.issues.filter((item) => item.severity === 'error');
  const warnings = readiness.preview.issues.filter((item) => item.severity === 'warning');

  return (
    <div>
      <PageHeader
        title="Ajustes"
        description="Preferencias, estado sanitizado del runtime y preparación del Preview."
        icon={Settings}
        domain="neutral"
      />

      <div className={styles.grid}>
        {maintenanceState !== 'none' && maintenanceState !== 'disabled' ? (
          <Card aria-labelledby="maintenance-title">
            <SectionHeader
              id="maintenance-title"
              title="Mantenimiento"
              description="Reparación puntual de una inconsistencia de rollback histórica."
              icon={ServerCog}
              domain={maintenanceState === 'repairable' ? 'projects' : 'danger'}
            />
            {maintenanceState === 'repairable' ? (
              <>
                <p className={styles.explainer}>Se detectó un rollback pendiente de reparación.</p>
                <form
                  action={async () => {
                    'use server';
                    await repairLegacyTaskRollbackAction();
                  }}
                >
                  <Button type="submit" variant="primary" size="sm">
                    Reparar rollback
                  </Button>
                </form>
              </>
            ) : null}
            {maintenanceState === 'requires-review' ? (
              <div className={styles.summary}>
                <CircleAlert size={18} aria-hidden="true" />
                <p>La reparación automática no es segura. Requiere revisión.</p>
              </div>
            ) : null}
            {maintenanceState === 'misconfigured' ? (
              <div className={styles.summary}>
                <CircleAlert size={18} aria-hidden="true" />
                <p>El mantenimiento no está disponible en esta configuración.</p>
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card aria-labelledby="appearance-title">
          <SectionHeader
            id="appearance-title"
            title="Apariencia"
            description="Elegí el tema de la interfaz."
            icon={Palette}
            domain="learning"
          />
          <ThemeControl />
        </Card>

        <Card aria-labelledby="runtime-title">
          <SectionHeader
            id="runtime-title"
            title="Runtime"
            description="Lectura de configuración, sin probar conectividad ni revelar valores."
            icon={ServerCog}
            domain="productivity"
            action={
              <Badge domain="neutral" variant="outline">
                {ENVIRONMENT_LABELS[readiness.environment]}
              </Badge>
            }
          />
          <p className={styles.explainer}>
            “Configurada” confirma que las variables requeridas son coherentes. La prueba con datos
            reales se realiza después en el deployment de Preview.
          </p>
        </Card>

        <Card aria-labelledby="sources-title">
          <SectionHeader
            id="sources-title"
            title="Fuentes y capacidades"
            description="Estado de lectura y flags sensibles del proceso actual."
            icon={PlugZap}
            domain="productivity"
          />
          <ul className={styles.sources}>
            {readiness.integrations.map((source) => (
              <li key={source.id} className={styles.source}>
                <div className={styles['source-text']}>
                  <span className={styles['source-name']}>{source.label}</span>
                  <span className={styles['source-detail']}>{source.summary}</span>
                </div>
                <Badge domain={STATUS_DOMAINS[source.status]} variant="outline">
                  {STATUS_LABELS[source.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="agents-title">
          <SectionHeader
            id="agents-title"
            title="Agentes especializados"
            description="Identidad server-side, permisos cerrados y estado sin revelar credenciales."
            icon={Bot}
            domain="productivity"
          />
          <ul className={styles.sources}>
            {agents.map((agent) => (
              <li key={agent.id} className={styles.source}>
                <div className={styles['source-text']}>
                  <span className={styles['source-name']}>{agent.name}</span>
                  <span className={styles['source-detail']}>
                    {agent.reads} lecturas · {agent.proposals} propuestas ·{' '}
                    {agent.externalAccess === 'pending-authorization'
                      ? 'acceso externo pendiente'
                      : 'sin acceso externo'}
                  </span>
                </div>
                <Badge domain={AGENT_STATUS_DOMAINS[agent.status]} variant="outline">
                  {AGENT_STATUS_LABELS[agent.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="automations-title">
          <SectionHeader
            id="automations-title"
            title="Automatizaciones controladas"
            description="Estado sanitizado del orquestador y su store dedicado, sin probar proveedores."
            icon={Workflow}
            domain="productivity"
            action={
              <Badge
                domain={AUTOMATION_STATUS_DOMAINS[automations.readinessState]}
                variant="outline"
              >
                {AUTOMATION_STATUS_LABELS[automations.readinessState]}
              </Badge>
            }
          />
          <ul className={styles.sources}>
            <li className={styles.source}>
              <div className={styles['source-text']}>
                <span className={styles['source-name']}>Preparación canónica</span>
                <span className={styles['source-detail']}>
                  {automations.readinessChecks.filter((check) => check.ready).length}/
                  {automations.readinessChecks.length} controles satisfechos
                </span>
              </div>
              <Badge
                domain={AUTOMATION_STATUS_DOMAINS[automations.readinessState]}
                variant="outline"
              >
                {AUTOMATION_STATUS_LABELS[automations.readinessState]}
              </Badge>
            </li>
            <li className={styles.source}>
              <div className={styles['source-text']}>
                <span className={styles['source-name']}>Orquestador</span>
                <span className={styles['source-detail']}>
                  Cliente fail-closed para workflows permitidos.
                </span>
              </div>
              <Badge
                domain={automations.orchestratorConfigured ? 'habits' : 'neutral'}
                variant="outline"
              >
                {automations.orchestratorConfigured ? 'Configurado' : 'No configurado'}
              </Badge>
            </li>
            <li className={styles.source}>
              <div className={styles['source-text']}>
                <span className={styles['source-name']}>Fronteras externas</span>
                <span className={styles['source-detail']}>
                  Callback {automations.callbackEnabled ? 'habilitado' : 'desactivado'} · templates{' '}
                  {automations.templatesProvisioned ? 'provisionados' : 'pendientes'} ·{' '}
                  {automations.credentialsConfigured}/6 principales
                </span>
              </div>
            </li>
            <li className={styles.source}>
              <div className={styles['source-text']}>
                <span className={styles['source-name']}>Store cifrado</span>
                <span className={styles['source-detail']}>
                  Namespace separado · contrato {automations.contractVersion}
                </span>
              </div>
              <Badge domain={automations.storeConfigured ? 'habits' : 'neutral'} variant="outline">
                {automations.storeConfigured ? 'Configurado' : 'No configurado'}
              </Badge>
            </li>
            <li className={styles.source}>
              <div className={styles['source-text']}>
                <span className={styles['source-name']}>Workflows</span>
                <span className={styles['source-detail']}>
                  {automationCounts.ready} listos · {automationCounts.disabled} desactivados ·{' '}
                  {automationCounts.degraded +
                    automationCounts.misconfigured +
                    automationCounts.paused}{' '}
                  requieren atención
                </span>
              </div>
            </li>
            <li className={styles.source}>
              <div className={styles['source-text']}>
                <span className={styles['source-name']}>Última ejecución</span>
                <span className={styles['source-detail']}>
                  {lastAutomationRun
                    ? `${lastAutomationRun.status} · ${new Date(lastAutomationRun.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
                    : 'Sin ejecuciones registradas'}
                </span>
              </div>
            </li>
          </ul>
        </Card>

        <Card aria-labelledby="preview-title">
          <SectionHeader
            id="preview-title"
            title="Preparación de Preview"
            description="Preflight cerrado para probar Web V1 sin tocar datos productivos."
            icon={ShieldCheck}
            domain={readiness.preview.ready ? 'habits' : 'projects'}
            action={
              <Badge domain={readiness.preview.ready ? 'habits' : 'projects'} variant="dot">
                {readiness.preview.ready ? 'Lista' : 'Pendiente'}
              </Badge>
            }
          />

          {readiness.preview.ready ? (
            <div className={styles.success}>
              <CircleCheckBig size={18} aria-hidden="true" />
              <p>
                La configuración cumple el preflight. Todavía falta verificar conectividad, datos
                reales y recorrido visual dentro del Preview.
              </p>
            </div>
          ) : (
            <div className={styles.summary}>
              <CircleAlert size={18} aria-hidden="true" />
              <p>
                Hay {errors.length} bloqueo{errors.length === 1 ? '' : 's'} y {warnings.length}{' '}
                advertencia{warnings.length === 1 ? '' : 's'} antes de certificar el Preview.
              </p>
            </div>
          )}

          {readiness.preview.issues.length > 0 ? (
            <ul className={styles.issues}>
              {readiness.preview.issues.map((item) => (
                <li key={item.code} data-severity={item.severity}>
                  <span className={styles['issue-code']}>{item.code}</span>
                  <span>{item.message}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className={styles.command}>
            Validación equivalente por terminal: <code>npm run preview:check</code>
          </p>
        </Card>
      </div>
    </div>
  );
}
