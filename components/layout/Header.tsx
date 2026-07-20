import { Plus } from 'lucide-react';

import { MobileNav } from '@/components/navigation/MobileNav';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

import { Brand } from './Brand';
import styles from './Header.module.scss';

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <MobileNav />
        <div className={styles.brand}>
          <Brand />
        </div>
      </div>
      <div className={styles.right}>
        <span className={styles.capture}>
          <Button href="/bandeja" variant="secondary" iconLeft={Plus}>
            Captura rápida
          </Button>
        </span>
        <span className={styles['capture-compact']}>
          <Button
            href="/bandeja"
            variant="secondary"
            iconLeft={Plus}
            iconOnly
            aria-label="Captura rápida"
          />
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
