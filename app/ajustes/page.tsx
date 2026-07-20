import { Palette, PlugZap, Settings } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ThemeControl } from '@/components/ui/ThemeControl';

import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Ajustes' };

const dataSources = [
  { id: 'sheets', name: 'Google Sheets', detail: 'Hábitos, salud, sueño y productividad.' },
  { id: 'notion', name: 'Notion', detail: 'Áreas, proyectos, tareas, aprendizaje y journaling.' },
  { id: 'calendar', name: 'Google Calendar', detail: 'Eventos y bloques de tiempo.' },
];

export default function AjustesPage() {
  return (
    <div>
      <PageHeader
        title="Ajustes"
        description="Preferencias de la aplicación y estado de las integraciones."
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
            description="Se conectarán en una fase posterior."
            icon={PlugZap}
            domain="productivity"
          />
          <ul className={styles.sources}>
            {dataSources.map((source) => (
              <li key={source.id} className={styles.source}>
                <div className={styles['source-text']}>
                  <span className={styles['source-name']}>{source.name}</span>
                  <span className={styles['source-detail']}>{source.detail}</span>
                </div>
                <Badge domain="neutral" variant="outline">
                  No conectado
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
