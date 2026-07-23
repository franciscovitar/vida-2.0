'use client';

import { AlertTriangle, RotateCcw, Settings } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

import styles from './error.module.scss';

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.page}>
      <Card className={styles.card} aria-labelledby="app-error-title">
        <span className={styles.icon} aria-hidden="true">
          <AlertTriangle size={22} strokeWidth={2} />
        </span>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Error controlado</p>
          <h1 id="app-error-title">No se pudo cargar esta vista</h1>
          <p>
            El error quedó contenido dentro de la aplicación. No se muestran detalles técnicos ni se
            reemplazan datos reales con información simulada.
          </p>
          <div className={styles.actions}>
            <Button type="button" variant="primary" iconLeft={RotateCcw} onClick={() => reset()}>
              Reintentar
            </Button>
            <Button href="/ajustes" variant="secondary" iconLeft={Settings}>
              Revisar Ajustes
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
