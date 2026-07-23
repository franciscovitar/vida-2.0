import {
  CircleAlert,
  CircleCheckBig,
  Palette,
  PlugZap,
  ServerCog,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ThemeControl } from '@/components/ui/ThemeControl';
import { requireAuthorizedSession } from '@/lib/auth/dal';
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

export default async function AjustesPage() {
  await requireAuthorizedSession();
  const readiness = getRuntimeReadiness();
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
