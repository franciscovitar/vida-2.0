import { FileQuestion, Home, Search } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

import styles from './not-found.module.scss';

export default function AppNotFound() {
  return (
    <div className={styles.page}>
      <Card className={styles.card} aria-labelledby="not-found-title">
        <span className={styles.icon} aria-hidden="true">
          <FileQuestion size={22} strokeWidth={2} />
        </span>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Página no disponible</p>
          <h1 id="not-found-title">No encontramos este recurso</h1>
          <p>
            Puede que la dirección haya cambiado o que el contenido ya no esté disponible.
          </p>
          <div className={styles.actions}>
            <Button href="/" variant="primary" iconLeft={Home}>
              Ir a Hoy
            </Button>
            <Button href="/buscar" variant="secondary" iconLeft={Search}>
              Buscar contenido
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
