import { AlertTriangle, FileQuestion, Settings, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { WebCatalogServiceCode } from '@/lib/web-catalog/errors';

import styles from './CatalogState.module.scss';

type CatalogStateProps = {
  title: string;
  message: string;
  code: WebCatalogServiceCode;
};

function stateCopy(code: WebCatalogServiceCode) {
  if (code === 'not-configured' || code === 'flag-disabled') {
    return {
      eyebrow: 'Configuración pendiente',
      detail:
        'La ruta está preparada, pero el servidor todavía no puede cargar su fuente documental.',
      icon: Settings,
    };
  }

  if (code === 'network-error' || code === 'rate-limited' || code === 'read-error') {
    return {
      eyebrow: 'Fuente temporalmente no disponible',
      detail:
        'No se reemplazó el contenido con información simulada. Podés volver a intentar más tarde.',
      icon: WifiOff,
    };
  }

  if (code === 'auth-error' || code === 'permission-error' || code === 'invalid-catalog') {
    return {
      eyebrow: 'Revisión técnica necesaria',
      detail:
        'El sistema falló de forma cerrada: el contenido no se publica hasta recuperar una configuración válida.',
      icon: AlertTriangle,
    };
  }

  return {
    eyebrow: 'Contenido no disponible',
    detail: 'Esta página no está publicada para la web actual.',
    icon: FileQuestion,
  };
}

export function CatalogState({ title, message, code }: CatalogStateProps) {
  const copy = stateCopy(code);
  const Icon = copy.icon;

  return (
    <Card className={styles.card} aria-labelledby="catalog-state-title">
      <span className={styles.icon} aria-hidden="true">
        <Icon size={20} strokeWidth={2} />
      </span>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h2 id="catalog-state-title">{title}</h2>
        <p>{message}</p>
        <p className={styles.detail}>{copy.detail}</p>
        <div className={styles.actions}>
          <Button href="/ajustes" variant="secondary" size="sm" iconLeft={Settings}>
            Revisar Ajustes
          </Button>
          <Button href="/" variant="ghost" size="sm">
            Volver a Hoy
          </Button>
        </div>
      </div>
    </Card>
  );
}
