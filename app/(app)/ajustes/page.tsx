import { Palette, PlugZap, Settings } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ThemeControl } from '@/components/ui/ThemeControl';
import { getCalendarConfig } from '@/lib/calendar/config';
import { getDataSource, getGoogleConfig } from '@/lib/data/config';
import { getNotionConfig, getNotionDataSource } from '@/lib/notion/config';
import { getOpenClawRuntimeStatus } from '@/lib/openclaw/config';
import { getWebCatalogNotionConfig, isWebCatalogEnabled } from '@/lib/web-catalog/config';
import { requireAuthorizedSession } from '@/lib/auth/dal';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Ajustes' };
export const dynamic = 'force-dynamic';

function sanitizedEnvironment(): string {
  const vercel = process.env.VERCEL_ENV?.trim();
  if (vercel === 'production') return 'Production';
  if (vercel === 'preview') return 'Preview';
  if (vercel === 'development') return 'Development';
  return 'Local';
}

type IntegrationRow = {
  id: string;
  name: string;
  detail: string;
  status: string;
  domain: 'habits' | 'projects' | 'productivity' | 'neutral';
};

export default async function AjustesPage() {
  await requireAuthorizedSession();

  const sheetsSource = getDataSource();
  const sheetsConfig = getGoogleConfig();
  const notionSource = getNotionDataSource();
  const notionConfig = getNotionConfig();
  const calendarConfig = getCalendarConfig();
  const catalogEnabled = isWebCatalogEnabled();
  const catalogConfig = getWebCatalogNotionConfig();
  const openClawStatus = getOpenClawRuntimeStatus();

  const integrations: IntegrationRow[] = [
    {
      id: 'sheets',
      name: 'Google Sheets',
      detail:
        sheetsSource === 'google' && sheetsConfig.ok
          ? 'Integración operativa · lectura y escritura acotada de hábitos.'
          : 'Modo simulado o sin configuración de servidor.',
      status:
        sheetsSource === 'google' && sheetsConfig.ok ? 'Operativa' : 'Simulada / no configurada',
      domain: 'habits',
    },
    {
      id: 'notion',
      name: 'Notion',
      detail:
        notionSource === 'notion' && notionConfig.ok
          ? 'Integración operativa · lectura de Áreas, Proyectos y Tareas.'
          : 'Modo simulado o sin configuración de servidor.',
      status:
        notionSource === 'notion' && notionConfig.ok ? 'Operativa' : 'Simulada / no configurada',
      domain: 'projects',
    },
    {
      id: 'calendar',
      name: 'Google Calendar',
      detail: calendarConfig.ok
        ? 'Integración operativa · lectura de eventos (solo lectura).'
        : 'Modo simulado o sin configuración de servidor.',
      status: calendarConfig.ok ? 'Operativa' : 'Simulada / no configurada',
      domain: 'productivity',
    },
    {
      id: 'web-catalog',
      name: 'Registro Web',
      detail: catalogEnabled
        ? catalogConfig.ok
          ? 'Feature activa · catálogo documental en lectura.'
          : 'Feature activa · falta configuración de servidor.'
        : 'Feature inactiva por defecto (WEB_CATALOG_ENABLED).',
      status: catalogEnabled ? (catalogConfig.ok ? 'Activa' : 'Activa sin config') : 'Inactiva',
      domain: 'neutral',
    },
    {
      id: 'openclaw',
      name: 'OpenClaw API',
      detail:
        openClawStatus === 'ready'
          ? 'API coordinadora habilitada · autenticación HMAC server-to-server.'
          : openClawStatus === 'misconfigured'
            ? 'Flag activa · falta configuración de servidor.'
            : 'API desactivada por defecto (OPENCLAW_API_ENABLED).',
      status:
        openClawStatus === 'ready'
          ? 'ready'
          : openClawStatus === 'misconfigured'
            ? 'misconfigured'
            : 'disabled',
      domain: 'neutral',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Ajustes"
        description="Preferencias de la aplicación y estado sanitizado de las integraciones."
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

        <Card aria-labelledby="sources-title">
          <SectionHeader
            id="sources-title"
            title="Fuentes de datos"
            description={`Entorno: ${sanitizedEnvironment()}. Sin tokens, IDs ni correos.`}
            icon={PlugZap}
            domain="productivity"
          />
          <ul className={styles.sources}>
            {integrations.map((source) => (
              <li key={source.id} className={styles.source}>
                <div className={styles['source-text']}>
                  <span className={styles['source-name']}>{source.name}</span>
                  <span className={styles['source-detail']}>{source.detail}</span>
                </div>
                <Badge domain={source.domain} variant="outline">
                  {source.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
